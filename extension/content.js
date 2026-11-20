// ==UserScript==
// @name         GitHub Image Lightbox
// @namespace    guille.github-image-lightbox
// @version      1.0.0
// @description  Abre las imágenes de issues, PRs, comentarios y README en un visor con zoom, arrastre y navegación, sin salir de la página.
// @match        https://github.com/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';
  if (window.__ghImageLightbox) return;
  window.__ghImageLightbox = true;

  /* ------------------------------------------------------------------ *
   * Configuración
   * ------------------------------------------------------------------ */
  const CONTAINERS = [
    '.markdown-body',
    '.comment-body',
    '.js-comment-body',
    '[data-testid="markdown-body"]',
  ];
  const EXCLUDE = [
    '.emoji',
    '.avatar',
    '.avatar-user',
    '[data-testid="github-avatar"]',
    'img[src*="avatars.githubusercontent.com"]',
    'img[src*="img.shields.io"]',
    'img[src*="badge"]',
  ].join(',');
  const MIN_SIZE = 40;      // px: ignora iconos diminutos
  const MAX_SCALE = 10;     // zoom máximo (1000 %)
  const MIN_SCALE = 0.1;
  const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#]|$)/i;

  /* ------------------------------------------------------------------ *
   * Estilos (en Shadow DOM: GitHub no los pisa y no afectan a GitHub)
   * ------------------------------------------------------------------ */
  const CSS = `
    :host { all: initial; }
    .overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(1, 4, 9, .92);
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #e6edf3; user-select: none; -webkit-user-select: none;
      animation: fade .15s ease;
    }
    .overlay[hidden] { display: none; }
    @keyframes fade { from { opacity: 0 } to { opacity: 1 } }

    .stage { position: absolute; inset: 0; overflow: hidden; cursor: zoom-out; touch-action: none; }
    .stage.grab { cursor: grab; }
    .stage.grabbing { cursor: grabbing; }

    .img {
      position: absolute; left: 50%; top: 50%;
      max-width: none; max-height: none;
      transform-origin: center center; will-change: transform;
      box-shadow: 0 8px 40px rgba(0,0,0,.6);
      background: repeating-conic-gradient(#2d333b 0 25%, #22272e 0 50%) 0 0 / 16px 16px;
      transition: opacity .15s;
    }
    .img.anim { transition: transform .18s ease, opacity .15s; }
    .overlay.loading .img { opacity: .25; }

    .spinner {
      position: absolute; top: 50%; left: 50%; width: 36px; height: 36px; margin: -18px;
      border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; border-radius: 50%;
      animation: spin .8s linear infinite; display: none; pointer-events: none;
    }
    .overlay.loading .spinner { display: block; }
    @keyframes spin { to { transform: rotate(360deg) } }

    .bar {
      position: absolute; top: 0; left: 0; right: 0;
      display: flex; align-items: center; gap: 4px; padding: 8px 12px;
      background: linear-gradient(rgba(0,0,0,.65), transparent);
    }
    .spacer { flex: 1; }
    .counter, .zoom { font-variant-numeric: tabular-nums; opacity: .85; }
    .zoom { min-width: 52px; text-align: center; font-size: 13px; }

    button {
      all: unset; box-sizing: border-box;
      min-width: 34px; height: 34px; padding: 0 8px;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 6px; cursor: pointer; color: #e6edf3; font: inherit; font-size: 16px;
    }
    button:hover { background: rgba(255,255,255,.12); }
    button:focus-visible { outline: 2px solid #2f81f7; outline-offset: 1px; }

    .nav {
      position: absolute; top: 50%; transform: translateY(-50%);
      width: 48px; height: 72px; font-size: 40px; background: rgba(0,0,0,.35);
    }
    .nav.prev { left: 12px; }
    .nav.next { right: 12px; }
    .nav[hidden] { display: none; }

    .caption {
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: 10px 16px 14px; text-align: center; font-size: 13px;
      background: linear-gradient(transparent, rgba(0,0,0,.65));
      pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .caption:empty { display: none; }
  `;

  // Cursor "lupa" sobre las imágenes que se pueden abrir (estilo en la página)
  const PAGE_CSS = CONTAINERS.map(c =>
    `${c} img:not(.emoji):not(.avatar):not(a img), ` +
    `${c} a[href*="user-attachments"] img, ${c} a[href*="githubusercontent.com"] img`
  ).join(', ') + ' { cursor: zoom-in; }';

  function adoptCss(target, css, fallbackParent) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = css;
      fallbackParent.appendChild(style);
    }
  }
  adoptCss(document, PAGE_CSS, document.head);

  /* ------------------------------------------------------------------ *
   * Construcción del visor (sin innerHTML, compatible con Trusted Types)
   * ------------------------------------------------------------------ */
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids);
    return el;
  };
  const btn = (act, label, title, cls = '') =>
    h('button', { type: 'button', class: cls, 'data-act': act, title, 'aria-label': title, text: label });

  const host = h('div', { id: 'gh-image-lightbox-host' });
  const root = host.attachShadow({ mode: 'open' });
  adoptCss(root, CSS, root);

  const img = h('img', { class: 'img', alt: '', draggable: 'false' });
  const stage = h('div', { class: 'stage' }, img);
  const spinner = h('div', { class: 'spinner' });
  const counter = h('span', { class: 'counter' });
  const zoomLbl = h('span', { class: 'zoom', text: '100%' });
  const closeBtn = btn('close', '✕', 'Cerrar (Esc)');
  const bar = h('div', { class: 'bar' },
    counter,
    h('span', { class: 'spacer' }),
    btn('zoomOut', '−', 'Alejar (−)'),
    zoomLbl,
    btn('zoomIn', '+', 'Acercar (+)'),
    btn('fit', '⤢', 'Ajustar a pantalla (0)'),
    btn('actual', '1:1', 'Tamaño real (1)'),
    btn('rotate', '⟳', 'Rotar (R)'),
    btn('open', '↗', 'Abrir original en pestaña nueva (O)'),
    closeBtn,
  );
  const prevBtn = btn('prev', '‹', 'Anterior (←)', 'nav prev');
  const nextBtn = btn('next', '›', 'Siguiente (→)', 'nav next');
  const caption = h('div', { class: 'caption' });
  const overlay = h('div', {
    class: 'overlay', hidden: '', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Visor de imágenes',
  }, stage, spinner, bar, prevBtn, nextBtn, caption);
  root.append(overlay);

  /* ------------------------------------------------------------------ *
   * Estado
   * ------------------------------------------------------------------ */
  const S = {
    items: [], i: 0,
    w: 0, h: 0,          // tamaño natural de la imagen
    scale: 1, fit: 1,    // escala actual y escala "ajustada a pantalla"
    x: 0, y: 0,          // desplazamiento desde el centro (px)
    rot: 0,              // grados, acumulativo (múltiplos de 90)
    lastFocus: null, prevOverflow: '',
  };
  let loadToken = 0;

  const isOpen = () => !overlay.hidden;
  const rotated = () => (S.rot / 90) % 2 !== 0;
  const dims = () => (rotated() ? [S.h, S.w] : [S.w, S.h]);

  function computeFit() {
    const [w, hh] = dims();
    if (!w || !hh) return 1;
    return Math.min((innerWidth * 0.94) / w, (innerHeight - 110) / hh, 1);
  }

  function canPan() {
    const [w, hh] = dims();
    return w * S.scale > innerWidth + 1 || hh * S.scale > innerHeight + 1;
  }

  function apply(anim) {
    img.classList.toggle('anim', !!anim);
    img.style.transform =
      `translate(calc(-50% + ${S.x}px), calc(-50% + ${S.y}px)) rotate(${S.rot}deg) scale(${S.scale})`;
    zoomLbl.textContent = Math.round(S.scale * 100) + '%';
    stage.classList.toggle('grab', canPan());
  }

  function fitView(anim) {
    S.fit = computeFit();
    S.scale = S.fit;
    S.x = S.y = 0;
    apply(anim);
  }

  // Zoom manteniendo fijo el punto (px, py) de la pantalla
  function zoomAt(newScale, px, py, anim) {
    const ns = Math.min(MAX_SCALE, Math.max(Math.min(MIN_SCALE, S.fit), newScale));
    const k = ns / S.scale;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const Cx = cx + S.x, Cy = cy + S.y;
    S.x = px - (px - Cx) * k - cx;
    S.y = py - (py - Cy) * k - cy;
    S.scale = ns;
    if (ns <= S.fit + 1e-6) S.x = S.y = 0; // a tamaño ajustado, recentra
    apply(anim);
  }
  const zoomCenter = f => zoomAt(S.scale * f, innerWidth / 2, innerHeight / 2, true);

  /* ------------------------------------------------------------------ *
   * Detección de imágenes "abribles"
   * ------------------------------------------------------------------ */
  function isImageLink(a, el) {
    const href = a.getAttribute('href') ? a.href : '';
    if (!href) return true;
    if (href === el.currentSrc || href === el.src) return true;
    try {
      const u = new URL(href);
      if (/(^|\.)githubusercontent\.com$/i.test(u.hostname)) return true;
      if (u.hostname === 'github.com' && u.pathname.startsWith('/user-attachments/')) return true;
      return IMG_EXT.test(u.pathname);
    } catch {
      return false;
    }
  }

  function qualifies(el) {
    if (!(el instanceof HTMLImageElement)) return false;
    if (!el.closest(CONTAINERS.join(','))) return false;
    if (el.matches(EXCLUDE)) return false;
    const a = el.closest('a');
    if (a && !isImageLink(a, el)) return false; // p. ej. un logo que enlaza a una web
    const r = el.getBoundingClientRect();
    const w = el.naturalWidth || r.width;
    const hh = el.naturalHeight || r.height;
    return !(w < MIN_SIZE && hh < MIN_SIZE);
  }

  function captionFor(el) {
    const alt = (el.alt || '').trim();
    return /^(image|imagen|img)$/i.test(alt) ? '' : alt;
  }

  function originalHref(el) {
    const a = el.closest('a');
    return a && isImageLink(a, el) && a.href ? a.href : (el.currentSrc || el.src);
  }

  /* ------------------------------------------------------------------ *
   * Abrir / cerrar / mostrar
   * ------------------------------------------------------------------ */
  function open(clicked) {
    const selector = CONTAINERS.map(c => `${c} img`).join(',');
    const all = [...document.querySelectorAll(selector)]
      .filter(el => el === clicked || (qualifies(el) && el.getClientRects().length));
    S.items = all.map(el => ({
      el,
      src: el.currentSrc || el.src,
      alt: captionFor(el),
      href: originalHref(el),
    }));

    if (!host.isConnected) document.body.append(host); // GitHub (Turbo) reemplaza el body al navegar
    S.lastFocus = document.activeElement;
    S.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    overlay.hidden = false;
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', onResize);

    show(Math.max(0, all.indexOf(clicked)));
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen()) return;
    loadToken++;
    overlay.hidden = true;
    img.removeAttribute('src');
    document.documentElement.style.overflow = S.prevOverflow;
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    if (S.lastFocus && S.lastFocus.focus) S.lastFocus.focus({ preventScroll: true });
  }

  function show(index) {
    const n = S.items.length;
    if (!n) return;
    S.i = ((index % n) + n) % n;
    const it = S.items[S.i];
    S.rot = 0;

    counter.textContent = n > 1 ? `${S.i + 1} / ${n}` : '';
    prevBtn.hidden = nextBtn.hidden = n < 2;
    caption.textContent = it.alt;
    overlay.classList.add('loading');

    const token = ++loadToken;
    const pre = new Image();
    pre.onload = () => {
      if (token !== loadToken) return;
      const r = it.el.getBoundingClientRect();
      S.w = pre.naturalWidth || r.width || 800;   // los SVG pueden no tener tamaño natural
      S.h = pre.naturalHeight || r.height || 600;
      img.src = it.src;
      img.style.width = S.w + 'px';
      img.style.height = S.h + 'px';
      overlay.classList.remove('loading');
      fitView(false);
      preloadNeighbors();
    };
    pre.onerror = () => {
      if (token !== loadToken) return;
      overlay.classList.remove('loading');
      caption.textContent = 'No se pudo cargar la imagen';
    };
    pre.src = it.src;
  }

  function preloadNeighbors() {
    const n = S.items.length;
    if (n < 2) return;
    [S.i + 1, S.i - 1].forEach(j => { new Image().src = S.items[((j % n) + n) % n].src; });
  }

  const actions = {
    close,
    prev: () => S.items.length > 1 && show(S.i - 1),
    next: () => S.items.length > 1 && show(S.i + 1),
    zoomIn: () => zoomCenter(1.25),
    zoomOut: () => zoomCenter(0.8),
    fit: () => fitView(true),
    actual: () => zoomAt(1, innerWidth / 2, innerHeight / 2, true),
    rotate: () => { S.rot += 90; fitView(true); },
    open: () => {
      const it = S.items[S.i];
      if (it) window.open(it.href || it.src, '_blank', 'noopener');
    },
  };

  /* ------------------------------------------------------------------ *
   * Eventos
   * ------------------------------------------------------------------ */
  // Captura en window: se ejecuta antes que los handlers de GitHub
  window.addEventListener('click', e => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // Ctrl/Cmd+clic = comportamiento normal
    const t = e.target;
    if (!(t instanceof HTMLImageElement) || !qualifies(t)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(t);
  }, true);

  overlay.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    e.stopPropagation();
    actions[b.dataset.act]();
  });

  function onKey(e) {
    const map = {
      Escape: actions.close,
      ArrowLeft: actions.prev,
      ArrowRight: actions.next,
      '+': actions.zoomIn, '=': actions.zoomIn,
      '-': actions.zoomOut, '_': actions.zoomOut,
      '0': actions.fit,
      '1': actions.actual,
      r: actions.rotate, R: actions.rotate,
      o: actions.open, O: actions.open,
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
    // Evita que los atajos de GitHub (s, g i, t…) se disparen con el visor abierto
    if (e.key !== 'Tab') e.stopImmediatePropagation();
  }

  function onResize() {
    const wasFit = Math.abs(S.scale - S.fit) < 1e-3;
    S.fit = computeFit();
    if (wasFit) fitView(false); else apply(false);
  }

  // Rueda: zoom hacia el cursor (también pinch de trackpad, que llega con ctrlKey)
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(S.scale * factor, e.clientX, e.clientY, false);
  }, { passive: false });

  // Doble clic: alterna entre ajustado y ampliado en el punto
  stage.addEventListener('dblclick', e => {
    if (S.scale > S.fit + 0.01) fitView(true);
    else zoomAt(Math.max(1, S.fit * 2.5), e.clientX, e.clientY, true);
  });

  // Arrastre, pinch táctil, swipe y clic fuera para cerrar
  const ptrs = new Map();
  let drag = null, pinch = null, moved = false;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      moved = false;
      drag = { sx: e.clientX, sy: e.clientY, ox: S.x, oy: S.y };
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: dist(a, b) || 1, s: S.scale };
      drag = null;
      moved = true;
    }
  });

  stage.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      zoomAt(pinch.s * dist(a, b) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2, false);
    } else if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved && canPan()) {
        S.x = drag.ox + dx;
        S.y = drag.oy + dy;
        stage.classList.add('grabbing');
        apply(false);
      }
    }
  });

  function endPointer(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    stage.classList.remove('grabbing');
    if (ptrs.size < 2) pinch = null;

    if (ptrs.size === 1) {
      const [p] = [...ptrs.values()];
      drag = { sx: p.x, sy: p.y, ox: S.x, oy: S.y };
      return;
    }
    if (ptrs.size > 0) return;

    const d = drag;
    drag = null;
    if (e.type !== 'pointerup') return;

    // Swipe horizontal para cambiar de imagen (táctil, sin zoom)
    if (d && moved && !canPan() && e.pointerType !== 'mouse') {
      const dx = e.clientX - d.sx;
      if (Math.abs(dx) > 60) (dx < 0 ? actions.next : actions.prev)();
      return;
    }
    // Clic fuera de la imagen: cerrar
    if (!moved) {
      const r = img.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) close();
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
})();
