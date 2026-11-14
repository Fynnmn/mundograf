// Sirve las fotos subidas desde el panel. Busca en R2 si está configurado; si no, en KV.
// Cada foto tiene su propia dirección y nunca cambia: se guarda en la caché de Cloudflare para siempre.
export async function onRequestGet({ env, params, request, waitUntil }) {
  const key = (params.path || []).join('/');
  if (!/^u\/\d{4}-\d{2}\/[\w-]+\.(webp|png|jpg)$/.test(key)) return new Response('No encontrado', { status: 404 });

  const cache = caches.default;
  const enCache = await cache.match(request);
  if (enCache) return enCache;

  const headers = new Headers();
  let body = null;
  if (env.MEDIA) {
    const obj = await env.MEDIA.get(key);
    if (obj) { obj.writeHttpMetadata(headers); headers.set('ETag', obj.httpEtag); body = obj.body; }
  } else {
    const { value, metadata } = await env.DATA.getWithMetadata(`media:${key}`, { type: 'arrayBuffer' });
    if (value) { headers.set('Content-Type', metadata?.tipo || 'image/webp'); body = value; }
  }
  if (!body) return new Response('No encontrado', { status: 404 });
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  const res = new Response(body, { headers });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
