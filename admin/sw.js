// Service worker del panel: abre al instante desde la pantalla de inicio del celular y,
// sin señal, muestra la última versión guardada (los cambios quedan en el dispositivo hasta publicar).
// El código se pide siempre primero a la red, así una actualización se ve enseguida.
// Los datos (/api) y la vista previa nunca se guardan.
const VERSION = 'mg-panel-v2';
const FOTOS = 'mg-fotos-v1';
// El panel puede vivir en cualquier dirección: todo se arma a partir de donde está este archivo
const RAIZ = new URL('./', self.location).pathname;
const BASE = ['', 'admin.css', 'admin.js', 'iconos.js', 'ordenar.js', 'imagenes.js', 'manifest.webmanifest', 'iconos/icono-192.png']
  .map(f => RAIZ + f).concat('/favicon.svg');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k.startsWith('mg-') && k !== VERSION && k !== FOTOS).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const mismo = url.origin === location.origin;
  if (mismo && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/vista-previa'))) return;
  if (mismo && (url.pathname.startsWith('/media/') || url.pathname.startsWith('/assets/'))) { e.respondWith(primeroGuardado(request)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(primeroGuardado(request)); return; }
  if (mismo && url.pathname.startsWith(RAIZ)) e.respondWith(primeroRed(request));
});

async function primeroRed(request) {
  const cache = await caches.open(VERSION);
  const clave = request.mode === 'navigate' ? RAIZ : request;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(clave, res.clone());
    return res;
  } catch {
    return (await cache.match(clave, { ignoreSearch: true }))
      || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function primeroGuardado(request) {
  const cache = await caches.open(FOTOS);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}
