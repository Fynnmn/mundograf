# Mundograf — Landing Page

Sitio web de **Mundograf**, imprenta y estudio de diseño gráfico (Fray Bentos y Montevideo, Uruguay).

## Stack

- HTML + CSS + JavaScript vanilla — un solo archivo, sin build.
- Google Fonts (Barlow Condensed + Inter).
- Logo oficial inline en SVG (recoloreable vía `currentColor`).

## Estructura

| Archivo | Descripción |
|---------|-------------|
| `index.html` | El sitio completo (markup + estilos + scripts). |
| `netlify.toml` | Config de deploy en Netlify (sitio estático, headers). |
| `Mundograf logo.svg` | Logo oficial vectorial (fuente). |
| `mundograf-brand-kit.md` | Brand kit: colores, tipografía, tono. |

## Desarrollo

Es estático: abrí `index.html` en el navegador, o serví la carpeta:

```bash
npx serve .
```

## Deploy

Conectado a Netlify con CI/CD. Cada `git push` a `main` redeploya automáticamente.

## Pendientes

- Reemplazar los placeholders del portfolio por fotos reales de trabajos.
- Conectar el formulario de contacto a un backend (Formspree / Netlify Forms).
- Video de fondo en el hero (opcional).
