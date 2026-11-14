// El panel vive en una dirección secreta (secreto PANEL_RUTA de Cloudflare, nunca en el código, que es público).
// Los archivos están en dist/admin/, pero /admin/ responde "no encontrado": solo se llega por la dirección secreta.
// Todo lo demás sigue de largo a los archivos estáticos.
import { onRequestGet as portada } from './index.js';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests";

const noEncontrado = () => new Response('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequest({ request, env, params, next }) {
  const partes = params.path || [];
  // La portada la arma functions/index.js (esta ruta comodín también agarra "/")
  if (!partes.length) return request.method === 'GET' || request.method === 'HEAD' ? portada({ request, env }) : next();
  const ruta = String(env.PANEL_RUTA || 'admin');
  if (partes[0] === 'admin' && ruta !== 'admin') return noEncontrado();
  if (partes[0] !== ruta) return next();

  const url = new URL(request.url);
  if (partes.length === 1 && !url.pathname.endsWith('/')) return Response.redirect(`${url.origin}/${ruta}/${url.search}`, 301);
  const resto = partes.slice(1).join('/');
  const interno = new URL(`/admin/${resto}`, url);
  const res = await env.ASSETS.fetch(new Request(interno, request));
  if (res.status === 404) return noEncontrado();
  // Si el estático redirige (por ejemplo /admin/index.html → /admin/), se traduce a la dirección secreta
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const destino = (res.headers.get('Location') || '').replace(/^(https?:\/\/[^/]+)?\/admin\//, `/${ruta}/`);
    return Response.redirect(new URL(destino, url).href, res.status);
  }
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('Content-Security-Policy', CSP);
  h.set('X-Frame-Options', 'DENY');
  h.set('X-Robots-Tag', 'noindex, nofollow');
  h.set('Referrer-Policy', 'same-origin'); // con no-referrer el formulario de la vista previa saldría con Origin: null
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Cache-Control', 'no-cache');
  return r;
}
