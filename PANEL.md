# Panel de Mundograf

El cliente edita la página sin depender de nadie. Hecho el 12/11/2026; el 17/11/2026 pasó a funcionar como el panel del librillo del campeonato.

- **Se entra con un link secreto, sin contraseña:** `https://mundograf.com.uy/<ruta>/#clave=<clave>`. Está en `CREDENCIALES-PANEL.txt`, que no se sube. Se abre una vez y ese celular o compu queda recordado; "Olvidar este dispositivo" (en Cuenta) lo saca.
- La ruta es el secreto `PANEL_RUTA` y de la clave Cloudflare guarda solo la huella SHA-256 (`PANEL_CLAVE_HUELLA`). Ninguna de las dos está en el código, que es público. `/admin/` responde "no encontrado", la página no tiene ningún link al panel y Google no lo indexa.
- **Todo se guarda solo,** como en el librillo: arriba dice "Guardando…" y después "Todo guardado". No hay botón Publicar: el cambio ya está en la página.
- **Deshacer:** la flechita ↶ o Ctrl+Z (fuera de un campo) vuelve atrás, paso por paso.
- **Escribir sobre la página:** en la vista previa se toca cualquier texto y se escribe encima. Tocar una foto abre su ficha.
- Si se corta internet, los cambios quedan en el dispositivo y se guardan solos cuando vuelve.

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
| Versiones anteriores | Una copia de la página cada 20 minutos de cambios (se guardan las últimas 15); se vuelve a cualquiera con un toque |
| Cuenta y seguridad | Dónde está abierto el panel (y olvidar dispositivos), actividad |

## Cómo trabaja

- **Vista previa en vivo** al lado (en la computadora) o en una hoja que sube (en el celular), en tamaño computadora o celular. La arma el mismo código que la página, así que es exactamente lo que se va a ver.
- Al volver a la pestaña se trae lo último, por si se editó desde otro dispositivo.
- Se instala como app en el celular (ícono del globo).

## Técnica

- Cloudflare Pages + Functions. El contenido, los mensajes, las sesiones y las fotos van en KV (binding `DATA`, namespace `mundograf-data`).
- Los archivos del panel se arman en `dist/admin/`, pero solo se sirven por la dirección secreta: lo hace `functions/[[path]].js`, que también devuelve 404 en `/admin/`.
- `plantilla.html` es la página con marcadores (`{{...}}`). `lib/render.js` la arma: lo usa `build.mjs` (versión estática de respaldo en `dist/index.html`) y `functions/index.js` (la portada real, con el contenido publicado, escrita en el HTML para Google).
- `functions/vista-previa.js` arma la página con el borrador, solo con sesión de administrador. No guarda nada.
- `functions/api/[[path]].js`: API del panel y del formulario. Sesiones firmadas con HMAC, cookie `__Host-` HttpOnly SameSite=Strict, límite de intentos, encabezado propio obligatorio para escribir, ingreso por link (se compara la huella de la clave).
- Galería: las filas las arma el servidor según el formato de cada foto, así ninguna se recorta y todas las de una fila tienen la misma altura.
- Las fotos que ya no usa ninguna versión se borran solas al publicar (las subidas que nunca se publicaron, a los 3 días).

## Probar en la compu

```bash
npm install
```

```bash
npm run dev
```

- Página: http://127.0.0.1:8796 · Panel: http://127.0.0.1:8796/estudio-prueba/#clave=… (la clave de prueba está en `.dev.vars`)
- Prueba automática del panel (con el servidor andando): `node pruebas/e2e-panel.cjs http://localhost:8796`

## Publicar

Ya está hecho: KV creado, secretos `SESSION_SECRET`, `PANEL_RUTA` y `PANEL_CLAVE_HUELLA` cargados en el proyecto `mundograf`.

- Para actualizar el código: `npm run deploy` desde esta carpeta (hace falta la sesión de wrangler en la cuenta de Máximo). El push a GitHub no publica: la publicación automática se sacó el 17/11/2026 porque nunca funcionó (al repositorio le faltaba el token de Cloudflare).
- Volver a publicar código no toca lo que el cliente cargó desde el panel.
- Cambiar la dirección del panel: `npx wrangler pages secret put PANEL_RUTA --project-name mundograf` y volver a publicar.
- Si el link se filtra: los pasos están en `CREDENCIALES-PANEL.txt` (clave nueva, cargar su huella en `PANEL_CLAVE_HUELLA` y volver a publicar). Cambiar `SESSION_SECRET` además olvida todos los dispositivos recordados.
