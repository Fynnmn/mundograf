// Utilidades compartidas por las Functions: respuestas, contraseña, sesiones, actividad y contenido.
import { ICONOS } from './iconos.js';

const enc = new TextEncoder();
const SESSION_COOKIE = 'mg_sess';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });

export const error = (status, mensaje) => json({ error: mensaje }, status);

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = s => b64url(enc.encode(s));
const fromB64url = s => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

// Compara dos textos sin cortar en el primer carácter distinto
async function igualSeguro(a, b, secret) {
  const [x, y] = await Promise.all([hmac(secret, a), hmac(secret, b)]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

/* ---------- Link secreto del panel ---------- */

// El panel se abre con un link (…/#clave=…), sin contraseña, como el librillo.
// En Cloudflare se guarda solo la huella SHA-256 de la clave (secreto PANEL_CLAVE_HUELLA), nunca la clave.
export async function linkOk(env, clave) {
  if (!env.PANEL_CLAVE_HUELLA || !env.SESSION_SECRET) throw new Error('Falta PANEL_CLAVE_HUELLA o SESSION_SECRET');
  const c = String(clave || '').slice(0, 200);
  if (c.length < 20) return false;
  const huella = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(c)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return igualSeguro(huella, String(env.PANEL_CLAVE_HUELLA).trim().toLowerCase(), env.SESSION_SECRET);
}

/* ---------- Contraseña (ya no se usa en el panel; queda por si se vuelve a activar) ---------- */

// Se puede cambiar desde el panel: queda en KV como hash PBKDF2, nunca en texto.
// Mientras no se cambie, vale la del secreto ADMIN_PASSWORD de Cloudflare.
const ITER = 100000; // máximo que permite Workers
async function pbkdf2(password, salt, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64url(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function passwordOk(env, password) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) throw new Error('Faltan ADMIN_PASSWORD o SESSION_SECRET');
  const pw = String(password || '').slice(0, 200);
  const auth = await env.DATA.get('auth', { type: 'json' });
  if (auth?.hash) {
    const h = await pbkdf2(pw, Uint8Array.from(fromB64url(auth.salt), c => c.charCodeAt(0)), auth.iter);
    return igualSeguro(h, auth.hash, env.SESSION_SECRET);
  }
  return igualSeguro(pw, env.ADMIN_PASSWORD, env.SESSION_SECRET);
}

export async function guardarPassword(env, nueva) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const auth = { hash: await pbkdf2(nueva, salt), salt: b64url(salt), iter: ITER, cambiada: Date.now() };
  await env.DATA.put('auth', JSON.stringify(auth));
  return auth.cambiada;
}

export const passwordCambiada = async env => (await env.DATA.get('auth', { type: 'json' }))?.cambiada || null;

/* ---------- Sesiones ---------- */

// Cada sesión es una clave ses:<id> en KV con el dispositivo y el lugar en los metadatos.
// Así se ve dónde está abierto el panel y se puede cerrar cualquier sesión a distancia.
// El dispositivo queda recordado, como en el librillo: "Salir" lo olvida.
const SESSION_DAYS = 400;  // vida máxima (lo más que permite una cookie)
const IDLE_DAYS = 120;     // sin abrir el panel en 4 meses, hay que volver a abrir el link

const esHttps = request => new URL(request.url).protocol === 'https:';
// En https va con el prefijo __Host-: segura, de este dominio exacto y sin subdominios
const cookieName = request => (esHttps(request) ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE);

export function dispositivo(request, app) {
  const ua = request.headers.get('User-Agent') || '';
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'otro dispositivo';
  if (app) return `App en ${so}`;
  const nav = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Navegador';
  return `${nav} en ${so}`;
}
export function lugar(request) {
  const cf = request.cf || {};
  return [cf.city, cf.country].filter(Boolean).join(', ') || 'Ubicación desconocida';
}

export async function crearSesion(env, request, { metodo = 'clave', app = false } = {}) {
  const id = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const ahora = Date.now();
  const info = { creada: ahora, vista: ahora, disp: dispositivo(request, app), lugar: lugar(request), metodo };
  await env.DATA.put(`ses:${id}`, '1', { expiration: Math.floor(ahora / 1000) + SESSION_DAYS * 86400, metadata: info });
  const firma = b64url(await hmac(env.SESSION_SECRET, `ses.${id}`));
  const secure = esHttps(request) ? '; Secure' : '';
  return { id, cookie: `${cookieName(request)}=${id}.${firma}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}` };
}

export const cerrarSesion = request => `${cookieName(request)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${esHttps(request) ? '; Secure' : ''}`;

// Devuelve { id, info } de la sesión actual, o null
export async function sesion(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|; )${cookieName(request)}=([^;]+)`));
  if (!m || !env.SESSION_SECRET) return null;
  const [id, firma] = m[1].split('.');
  if (!id || !firma || id.length > 64) return null;
  const esperada = b64url(await hmac(env.SESSION_SECRET, `ses.${id}`));
  if (!(await igualSeguro(firma, esperada, env.SESSION_SECRET))) return null;
  const { value, metadata: info } = await env.DATA.getWithMetadata(`ses:${id}`);
  if (!value || !info) return null;
  const ahora = Date.now();
  if (ahora - info.vista > IDLE_DAYS * 864e5 || ahora - info.creada > SESSION_DAYS * 864e5) {
    await env.DATA.delete(`ses:${id}`);
    return null;
  }
  // El último uso se anota como mucho cada 12 horas (KV tiene un cupo de escrituras por día)
  if (ahora - info.vista > 12 * 36e5) {
    info.vista = ahora;
    await env.DATA.put(`ses:${id}`, '1', { expiration: Math.floor(info.creada / 1000) + SESSION_DAYS * 86400, metadata: info });
  }
  return { id, info };
}

export async function listarSesiones(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.DATA.list({ prefix: 'ses:', cursor });
    out.push(...r.keys.filter(k => k.metadata).map(k => ({ id: k.name.slice(4), ...k.metadata })));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out.sort((a, b) => b.vista - a.vista);
}

export const borrarSesion = (env, id) => env.DATA.delete(`ses:${id}`);

/* ---------- Actividad ---------- */

export async function registrar(env, request, evento, extra = {}) {
  const lista = (await env.DATA.get('actividad', { type: 'json' })) || [];
  const item = { t: Date.now(), evento, disp: dispositivo(request, extra.app), lugar: lugar(request) };
  if (extra.detalle) item.detalle = String(extra.detalle).slice(0, 80);
  lista.unshift(item);
  await env.DATA.put('actividad', JSON.stringify(lista.slice(0, 40)));
}

export const leerActividad = async env => (await env.DATA.get('actividad', { type: 'json' })) || [];

/* ---------- Retos firmados para las llaves de acceso ---------- */

// No ocupan almacenamiento hasta que se usan: el servidor reconoce los suyos por la firma
export async function nuevoReto(env, tipo) {
  const base = `${tipo}.${Date.now()}.${b64url(crypto.getRandomValues(new Uint8Array(16)))}`;
  return b64urlText(`${base}.${b64url(await hmac(env.SESSION_SECRET, `reto.${base}`))}`);
}
export async function retoValido(env, reto, tipo) {
  let txt;
  try { txt = fromB64url(reto); } catch { return false; }
  const partes = txt.split('.');
  if (partes.length !== 4 || partes[0] !== tipo) return false;
  const base = partes.slice(0, 3).join('.');
  const esperada = b64url(await hmac(env.SESSION_SECRET, `reto.${base}`));
  if (!(await igualSeguro(partes[3], esperada, env.SESSION_SECRET))) return false;
  if (Date.now() - Number(partes[1]) > 5 * 60e3) return false;
  const k = `reto:${partes[2]}`; // cada reto sirve una sola vez
  if (await env.DATA.get(k)) return false;
  await env.DATA.put(k, '1', { expirationTtl: 600 });
  return true;
}

export { b64url, fromB64url, enc };

/* ---------- Contenido de la página (KV) ---------- */

const KEY = 'contenido';
const HISTORIAL = 'historial';
const MAX_HISTORIAL = 15;

export async function leerContenido(env, request) {
  const data = await env.DATA.get(KEY, { type: 'json' });
  if (data) return data;
  // Primera vez: arranca con lo que ya estaba en la página
  const res = await env.ASSETS.fetch(new URL('/data/contenido.json', request.url));
  const seed = await res.json();
  seed.publicado = new Date().toISOString();
  await env.DATA.put(KEY, JSON.stringify(seed));
  return seed;
}

// Publica una versión nueva y guarda la anterior en el historial (para poder volver atrás)
// Cada cambio se guarda al instante. Al historial va una copia de cómo estaba la página
// cuando pasaron más de 20 minutos desde la copia anterior (así no se llena con cada letra).
const COPIA_CADA = 20 * 60e3;
export async function publicarContenido(env, nuevo, previo, request) {
  const lista = (await env.DATA.get(HISTORIAL, { type: 'json' })) || [];
  const ahora = Date.now();
  const copia = previo && (!lista.length || ahora - (lista[0].guardada || 0) > COPIA_CADA);
  if (copia) {
    lista.unshift({ id: `v${previo.version || 0}-${ahora.toString(36)}`, version: previo.version || 0, publicado: previo.publicado || null, disp: previo.disp || null, guardada: ahora, contenido: previo });
    await env.DATA.put(HISTORIAL, JSON.stringify(lista.slice(0, MAX_HISTORIAL)));
  }
  const out = { ...nuevo, version: (previo?.version || 0) + 1, publicado: new Date().toISOString(), disp: dispositivo(request) };
  await env.DATA.put(KEY, JSON.stringify(out));
  return { contenido: out, copia };
}

export const leerHistorial = async env => (await env.DATA.get(HISTORIAL, { type: 'json' })) || [];

/* ---------- Validación ---------- */

const str = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Títulos de sección: una línea, o dos si el cliente pone un salto (Enter) donde quiere el corte
const titulo = (v, max = 80) => String(v ?? '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3).join('\n').slice(0, max);
const parrafo = (v, max = 400) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const id = v => (/^[\w-]{1,40}$/.test(v || '') ? v : crypto.randomUUID().slice(0, 8));
const ruta = s => typeof s === 'string' && (/^\/media\/u\/\d{4}-\d{2}\/[\w-]+\.(webp|png|jpg)$/.test(s) || /^\/assets\/[\w-]+\.(jpg|jpeg|png|webp)$/.test(s));
const foto = f => (f && ruta(f.l) && ruta(f.s) && Number(f.w) > 0 && Number(f.h) > 0
  ? { l: f.l, s: f.s, w: Math.round(Number(f.w)), h: Math.round(Number(f.h)) } : null);
const url = (v, re) => (re.test(v || '') ? str(v, 200) : '');

// vista: true para la vista previa (deja los números a medio escribir, así no se corren de lugar)
export function limpiarContenido(c, { vista = false } = {}) {
  const n = c.negocio || {}, p = c.portada || {}, s = c.servicios || {}, w = c.porque || {}, t = c.trabajos || {};
  const out = {
    negocio: {
      whatsapp: str(n.whatsapp, 30),
      mensajeWa: str(n.mensajeWa, 200),
      email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(n.email || '') ? str(n.email, 120) : '',
      instagram: str(n.instagram, 60).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[^\w.]/g, ''),
      facebook: url(n.facebook, /^https:\/\/(www\.|m\.)?facebook\.com\/[\w.\-/?=]+$/),
      ciudades: (Array.isArray(n.ciudades) ? n.ciudades : []).map(x => str(x, 40)).filter(Boolean).slice(0, 4),
    },
    portada: {
      etiqueta: str(p.etiqueta, 70),
      titulo: str(p.titulo, 90),
      destacado: str(p.destacado, 40),
      bajada: parrafo(p.bajada, 220),
      boton: str(p.boton, 32),
    },
    servicios: {
      titulo: titulo(s.titulo),
      bajada: parrafo(s.bajada, 260),
      items: (Array.isArray(s.items) ? s.items : []).slice(0, 12).map(x => ({
        id: id(x.id), icono: ICONOS[x.icono] ? x.icono : 'marca', titulo: str(x.titulo, 50), texto: parrafo(x.texto, 200),
      })).filter(x => vista || x.titulo),
    },
    porque: {
      titulo: titulo(w.titulo),
      bajada: parrafo(w.bajada, 320),
      cifras: (Array.isArray(w.cifras) ? w.cifras : []).slice(0, 4).map(x => ({ valor: str(x.valor, 8), etiqueta: str(x.etiqueta, 30) })).filter(x => vista || (x.valor && x.etiqueta)),
      puntos: (Array.isArray(w.puntos) ? w.puntos : []).slice(0, 6).map(x => ({ id: id(x.id), titulo: str(x.titulo, 50), texto: parrafo(x.texto, 240) })).filter(x => vista || x.titulo),
    },
    trabajos: {
      titulo: titulo(t.titulo),
      bajada: parrafo(t.bajada, 260),
      items: (Array.isArray(t.items) ? t.items : []).slice(0, 40).map(x => ({
        id: id(x.id), visible: x.visible !== false, etiqueta: str(x.etiqueta, 40), alt: str(x.alt, 160), foto: foto(x.foto),
      })).filter(x => x.foto),
    },
    contacto: {
      titulo: titulo(c.contacto?.titulo),
      bajada: parrafo(c.contacto?.bajada, 260),
      gracias: str(c.contacto?.gracias, 120),
    },
    pie: { texto: parrafo(c.pie?.texto, 220) },
    seo: { titulo: str(c.seo?.titulo, 90), descripcion: str(c.seo?.descripcion, 200) },
  };
  const faltan = [];
  if (!out.negocio.whatsapp.replace(/\D/g, '')) faltan.push('el número de WhatsApp');
  if (!out.portada.titulo) faltan.push('el título de la portada');
  if (!out.seo.titulo) faltan.push('el título para Google');
  return { contenido: out, faltan };
}

// Todas las fotos subidas (/media/...) que usa un contenido
export function mediaKeys(obj) {
  const out = new Set();
  const visit = v => {
    if (typeof v === 'string' && v.startsWith('/media/')) out.add(v.slice(7));
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(obj);
  return out;
}
