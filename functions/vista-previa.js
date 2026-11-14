// Vista previa del panel: arma la página con el borrador que se está editando, sin publicarlo ni guardarlo.
// El panel la pide con un formulario dirigido a su iframe; solo responde con sesión de administrador.
import { sesion, limpiarContenido } from '../lib/core.js';
import { renderPagina } from '../lib/render.js';
import plantilla from '../lib/plantilla.gen.js';
import { conEncabezados } from './index.js';

const texto = (status, t) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return texto(403, 'Pedido no permitido.');
  if (!(await sesion(env, request))) return texto(401, 'Tu sesión venció. Volvé a entrar al panel.');

  const form = await request.formData();
  let borrador;
  try { borrador = JSON.parse(String(form.get('contenido') || '')); } catch { return texto(400, 'Borrador ilegible.'); }
  const { contenido } = limpiarContenido(borrador);
  const scroll = Math.max(0, Math.min(200000, Math.round(Number(form.get('scroll')) || 0)));
  const ir = /^[a-z-]{1,30}$/.test(form.get('ir') || '') ? form.get('ir') : '';

  const html = renderPagina(plantilla, contenido, {
    origen: url.origin,
    robots: 'noindex, nofollow',
    htmlAttr: ` data-vista-previa data-scroll="${scroll}" data-ir="${ir}"`,
    extraBody: '\n<script src="/js/vista-previa.js"></script>',
  });
  return conEncabezados(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }), { cache: 'no-store' });
}
