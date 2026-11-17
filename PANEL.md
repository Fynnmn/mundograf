# Panel de Mundograf

El cliente entra al panel con su contraseña y cambia la página sin depender de nadie. Hecho el 12/11/2026, publicado el 13/11/2026.

**La dirección del panel es secreta.** No está en el código (el repositorio de GitHub es público): es el secreto `PANEL_RUTA` de Cloudflare. La dirección y la contraseña inicial están en `CREDENCIALES-PANEL.txt`, que no se sube. `/admin/` responde "no encontrado", la página no tiene ningún link al panel y Google no lo indexa.

## Qué puede cambiar

| Sección del panel | Qué toca en la página |
|---|---|
| Portada | Título (y la palabra en celeste, que se elige tocándola), línea de arriba, texto y botón verde |
| Servicios | Título, texto y las tarjetas: nombre, descripción e ícono (14 a elegir). Se agregan, se borran y se ordenan arrastrando |
| Por qué Mundograf | Título, texto, los números (hasta 4, o ninguno) y los motivos |
| Trabajos | Las fotos: se suben varias juntas, se achican solas a WebP, se ordenan arrastrando, cada una con etiqueta, descripción para Google y opción de ocultarla |
| Contacto y pie | Textos de la sección Contacto, el mensaje después de enviar el formulario y el texto del pie |
| Teléfono, email y redes | WhatsApp (con botón para probarlo), mensaje que viene escrito, email, Instagram, Facebook y ciudades. Cambian en todos los lugares de una vez |
| Cómo aparece en Google | Título y descripción, con una muestra de cómo se ve el resultado |
| Mensajes | Lo que llega por el formulario de contacto (antes el formulario no mandaba nada) |
| Versiones anteriores | Las últimas 15 publicaciones; cualquiera se puede cargar y volver a publicar |
| Cuenta y seguridad | Contraseña, Face ID / huella / Windows Hello, dónde está abierto el panel, actividad |

## Cómo trabaja

- Todo lo que se toca queda como **borrador** en el dispositivo (si se cierra la pestaña, sigue ahí). La página no cambia hasta tocar **Publicar**. **Descartar** vuelve a lo publicado.
- **Vista previa en vivo** al lado (en la computadora) o en una hoja que sube (en el celular), en tamaño computadora o celular. La arma el mismo código que la página, así que es exactamente lo que se va a ver.
- Si dos personas publican desde dispositivos distintos, el panel avisa en vez de pisar.
- Se instala como app en el celular (ícono del globo).

## Técnica

- Cloudflare Pages + Functions. El contenido, los mensajes, las sesiones y las fotos van en KV (binding `DATA`, namespace `mundograf-data`).
- Los archivos del panel se arman en `dist/admin/`, pero solo se sirven por la dirección secreta: lo hace `functions/[[path]].js`, que también devuelve 404 en `/admin/`.
- `plantilla.html` es la página con marcadores (`{{...}}`). `lib/render.js` la arma: lo usa `build.mjs` (versión estática de respaldo en `dist/index.html`) y `functions/index.js` (la portada real, con el contenido publicado, escrita en el HTML para Google).
- `functions/vista-previa.js` arma la página con el borrador, solo con sesión de administrador. No guarda nada.
- `functions/api/[[path]].js`: API del panel y del formulario. Sesiones firmadas con HMAC, cookie `__Host-` HttpOnly SameSite=Strict, límite de intentos, encabezado propio obligatorio para escribir, contraseña cambiable (PBKDF2), llaves de acceso (WebAuthn).
- Galería: las filas las arma el servidor según el formato de cada foto, así ninguna se recorta y todas las de una fila tienen la misma altura.
- Las fotos que ya no usa ninguna versión se borran solas al publicar (las subidas que nunca se publicaron, a los 3 días).

## Probar en la compu

```bash
npm install
```

```bash
npm run dev
```

- Página: http://127.0.0.1:8796 · Panel: http://127.0.0.1:8796/estudio-prueba/ (la ruta y la contraseña de prueba están en `.dev.vars`)
- Prueba automática del panel (con el servidor andando): `node pruebas/e2e-panel.cjs http://localhost:8796`

## Publicar

Ya está hecho (13/11/2026): KV creado, secretos `ADMIN_PASSWORD`, `SESSION_SECRET` y `PANEL_RUTA` cargados en el proyecto `mundograf`.

- Para actualizar el código: `npm run deploy` desde esta carpeta (hace falta la sesión de wrangler en la cuenta de Máximo). El push a GitHub no publica: la publicación automática se sacó el 17/11/2026 porque nunca funcionó (al repositorio le faltaba el token de Cloudflare).
- Volver a publicar código no toca lo que el cliente cargó desde el panel.
- Cambiar la dirección del panel: `npx wrangler pages secret put PANEL_RUTA --project-name mundograf` y volver a publicar.
- Si se filtra la contraseña: el cliente la cambia desde el panel, o se pisa con `npx wrangler pages secret put ADMIN_PASSWORD` (solo vale si nunca la cambió desde el panel). Cambiar `SESSION_SECRET` cierra todas las sesiones.
