# Image Lightbox for GitHub

<img src="assets/logo-300.png" alt="Logo" width="96" align="right">

Abre las imágenes de **issues, pull requests, comentarios y README** de GitHub en un visor a pantalla completa, sin salir de la página ni abrir pestañas nuevas.

## Características

- Clic en cualquier captura o imagen adjunta para verla en grande.
- Zoom con la rueda del ratón o el gesto de pellizcar del trackpad (hasta 1000 %), centrado en el cursor.
- Arrastrar para mover la imagen; doble clic para alternar entre ajustado y ampliado.
- Navegación entre todas las imágenes del hilo con las flechas o los botones en pantalla.
- Rotar 90°, ver a tamaño real (1:1) o abrir el original en una pestaña nueva.
- Soporte táctil: pellizcar para hacer zoom y deslizar para cambiar de imagen.
- `Ctrl`/`Cmd` + clic conserva el comportamiento normal de GitHub.
- Las imágenes que enlazan a otros sitios (logos, badges) siguen funcionando como enlace.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `Esc` | Cerrar |
| `←` / `→` | Imagen anterior / siguiente |
| `+` / `-` | Acercar / alejar |
| `0` | Ajustar a pantalla |
| `1` | Tamaño real |
| `R` | Rotar |
| `O` | Abrir original en pestaña nueva |

## Instalación

### Como extensión (Edge / Chrome)

1. Clona el repositorio o descarga el ZIP.
2. Abre `edge://extensions` o `chrome://extensions` y activa el **Modo desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `extension/`.

### Como userscript (Tampermonkey / Violentmonkey)

Crea un script nuevo y pega el contenido de [`userscript/lightbox-for-github.user.js`](userscript/lightbox-for-github.user.js).

## Estructura

```
extension/       Extensión Manifest V3 (manifest, content script e iconos)
userscript/      Mismo código como userscript
assets/          Logo para la tienda
scripts/build.sh Genera dist/lightbox-for-github-<versión>.zip
```

## Empaquetar

```bash
./scripts/build.sh
```

El ZIP resultante se sube tal cual a Microsoft Edge Add-ons o Chrome Web Store.

## Privacidad

Se ejecuta solo en `https://github.com/*`. No recopila datos, no hace peticiones de red propias, no incluye código remoto y no requiere permisos especiales.

## Licencia

[MIT](LICENSE)
