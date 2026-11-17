# Mundograf

Página de **Mundograf**, imprenta y estudio de diseño gráfico (Fray Bentos y Montevideo, Uruguay), con panel para que el cliente la edite.

- `plantilla.html`: la página (diseño, estilos y marcadores del contenido).
- `data/contenido.json`: el contenido inicial. Desde que se publica, el contenido lo maneja el panel.
- `admin/`: el panel. `functions/` y `lib/`: el servidor (Cloudflare Pages Functions).
- `build.mjs`: arma `dist/`, que es lo que se publica.

Cómo funciona el panel, cómo probarlo y cómo publicarlo: [PANEL.md](PANEL.md).

Publicar cambios de código: `npm run deploy` desde esta carpeta (arma `dist/` y lo sube a Cloudflare Pages, proyecto `mundograf`). Hacer push a GitHub no publica nada: el repositorio es solo el respaldo del código.
