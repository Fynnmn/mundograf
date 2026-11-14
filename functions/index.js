// Portada: la plantilla armada con el contenido publicado desde el panel.
// Va escrita en el HTML (no se arma con JavaScript), así Google y las vistas previas de WhatsApp la leen completa.
import { leerContenido, limpiarContenido } from '../lib/core.js';
import { renderPagina } from '../lib/render.js';
import plantilla from '../lib/plantilla.gen.js';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests";

export async function onRequestGet({ request, env }) {
  let c;
  try {
    c = limpiarContenido(await leerContenido(env, request)).contenido;
  } catch (e) {
    console.error(e);
    return env.ASSETS.fetch(new URL('/index.html', request.url)); // respaldo: la versión estática
  }
  const origen = new URL(request.url).origin;
  return conEncabezados(new Response(renderPagina(plantilla, c, { origen }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}

export function conEncabezados(res, { cache = 'public, max-age=0, must-revalidate', marco = 'SAMEORIGIN' } = {}) {
  const h = res.headers;
  h.set('Content-Security-Policy', marco === 'DENY' ? CSP.replace("frame-ancestors 'self'", "frame-ancestors 'none'") : CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('X-Frame-Options', marco);
  h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), browsing-topics=()');
  h.set('Cache-Control', cache);
  return res;
}
