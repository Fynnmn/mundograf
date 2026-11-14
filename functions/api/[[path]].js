// API de la página y del panel. Rutas:
//   POST /api/mensaje                       público: formulario de contacto de la página
//   GET  /api/sesion                        ¿hay sesión? ¿hay llaves de acceso?
//   POST /api/login  {password, app}        entra con contraseña
//   POST /api/passkey/reto                  reto para entrar con llave de acceso
//   POST /api/passkey/entrar                entra con llave de acceso (Face ID, Touch ID, huella)
//   POST /api/logout
//   GET  /api/admin/contenido               lo publicado + resumen del historial
//   PUT  /api/admin/contenido {contenido, base}   publica (base = versión sobre la que se editó)
//   GET  /api/admin/historial/:id           una versión anterior completa
//   POST /api/admin/fotos                   sube una imagen (cuerpo crudo) y devuelve su URL
//   GET  /api/admin/mensajes                mensajes del formulario
//   PATCH /api/admin/mensajes/:id {leido}   DELETE /api/admin/mensajes/:id
//   GET  /api/admin/seguridad               sesiones, llaves y actividad
//   PUT  /api/admin/clave {actual, nueva}
//   DELETE /api/admin/sesiones/:id          ("otras" = todas menos esta)
//   POST /api/admin/passkeys/reto · POST /api/admin/passkeys · DELETE /api/admin/passkeys/:id
import {
  json, error, passwordOk, crearSesion, cerrarSesion, sesion,
  leerContenido, publicarContenido, leerHistorial, limpiarContenido, mediaKeys,
  guardarPassword, passwordCambiada, listarSesiones, borrarSesion, registrar, leerActividad,
  nuevoReto, retoValido,
} from '../../lib/core.js';
import { rpId, leerLlaves, guardarLlaves, verificarRegistro, verificarIngreso } from '../../lib/webauthn.js';

const MAX_FOTO = 8 * 1024 * 1024;
const TIPOS_FOTO = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const MAX_INTENTOS_IP = 8;       // por IP cada 15 minutos
const MAX_INTENTOS_TOTAL = 40;   // entre todas las IP por hora: frena ataques repartidos
const MAX_MENSAJES = 300;

export async function onRequest({ request, env, params }) {
  const ruta = (params.path || []).join('/');
  const metodo = request.method;
  try {
    // Toda escritura tiene que salir de esta misma página: otro sitio no puede mandar este encabezado ni este origen
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      const origin = request.headers.get('Origin');
      if (request.headers.get('X-Mundograf') !== '1' || (origin && origin !== new URL(request.url).origin)) return error(403, 'Pedido no permitido.');
    }
    if (ruta === 'mensaje' && metodo === 'POST') return recibirMensaje(request, env);
    if (ruta === 'sesion' && metodo === 'GET') {
      const s = await sesion(env, request);
      return json({ admin: !!s, llaves: (await leerLlaves(env)).length > 0 });
    }
    if (ruta === 'login' && metodo === 'POST') return login(request, env);
    if (ruta === 'passkey/reto' && metodo === 'POST') return json({ reto: await nuevoReto(env, 'get'), rpId: rpId(request) });
    if (ruta === 'passkey/entrar' && metodo === 'POST') return entrarConLlave(request, env);
    if (ruta === 'logout' && metodo === 'POST') {
      const s = await sesion(env, request);
      if (s) await borrarSesion(env, s.id);
      return conCookies(json({ ok: true }), [cerrarSesion(request)]);
    }
    if (ruta.startsWith('admin/')) {
      const s = await sesion(env, request);
      if (!s) return error(401, 'Tu sesión venció. Volvé a entrar.');
      return await admin(ruta.slice(6), metodo, request, env, s);
    }
    return error(404, 'No existe.');
  } catch (e) {
    console.error(e);
    return error(500, 'Algo falló en el servidor. Probá de nuevo en un momento.');
  }
}

function conCookies(res, cookies) {
  const r = new Response(res.body, res);
  for (const c of cookies) r.headers.append('Set-Cookie', c);
  return r;
}

/* ---------- Formulario de contacto ---------- */

async function recibirMensaje(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const k = `form:${ip}`;
  const usados = Number(await env.DATA.get(k)) || 0;
  if (usados >= 5) return error(429, 'Ya recibimos varios mensajes desde tu conexión. Probá más tarde o escribinos por WhatsApp.');
  const b = await request.json().catch(() => ({}));
  // Campo trampa: lo completan los robots, no las personas. Se responde "ok" para no darles pistas.
  if (b.sitio_web) return json({ ok: true });
  const nombre = String(b.nombre || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().slice(0, 120);
  const mensaje = String(b.mensaje || '').trim().slice(0, 3000);
  if (!nombre || !mensaje || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(400, 'Revisá el nombre, el email y el mensaje.');
  const lista = (await env.DATA.get('mensajes', { type: 'json' })) || [];
  lista.unshift({ id: crypto.randomUUID().slice(0, 12), t: Date.now(), nombre, email, mensaje, leido: false });
  await Promise.all([
    env.DATA.put('mensajes', JSON.stringify(lista.slice(0, MAX_MENSAJES))),
    env.DATA.put(k, String(usados + 1), { expirationTtl: 3600 }),
  ]);
  return json({ ok: true });
}

/* ---------- Ingreso ---------- */

const hora = () => new Date().toISOString().slice(0, 13);
async function limites(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const kIp = `intentos:${ip}`, kTotal = `intentos-total:${hora()}`;
  const [porIp, total] = await Promise.all([env.DATA.get(kIp), env.DATA.get(kTotal)]).then(v => v.map(n => Number(n) || 0));
  return {
    bloqueadoIp: porIp >= MAX_INTENTOS_IP,
    bloqueadoTotal: total >= MAX_INTENTOS_TOTAL,
    async fallo() {
      await Promise.all([
        env.DATA.put(kIp, String(porIp + 1), { expirationTtl: 900 }),
        env.DATA.put(kTotal, String(total + 1), { expirationTtl: 3700 }),
      ]);
      await new Promise(r => setTimeout(r, 400));
    },
    limpiar: () => env.DATA.delete(kIp),
  };
}

async function login(request, env) {
  const lim = await limites(request, env);
  if (lim.bloqueadoIp) return error(429, 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.');
  if (lim.bloqueadoTotal) {
    return error(429, (await leerLlaves(env)).length
      ? 'Por seguridad, el ingreso con contraseña está pausado una hora. Podés entrar con Face ID o tu huella.'
      : 'Por seguridad, el ingreso con contraseña está pausado una hora.');
  }
  const { password, app } = await request.json().catch(() => ({}));
  if (!(await passwordOk(env, password))) {
    await lim.fallo();
    await registrar(env, request, 'fallido');
    return error(401, 'La contraseña no es correcta.');
  }
  await lim.limpiar();
  await registrar(env, request, 'ingreso', { app, detalle: 'Con contraseña' });
  const nueva = await crearSesion(env, request, { metodo: 'clave', app: !!app });
  return conCookies(json({ ok: true }), [nueva.cookie]);
}

async function entrarConLlave(request, env) {
  const lim = await limites(request, env);
  if (lim.bloqueadoIp) return error(429, 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.');
  const cuerpo = await request.json().catch(() => ({}));
  const llaves = await leerLlaves(env);
  let usada;
  try {
    usada = await verificarIngreso(request, cuerpo, llaves, ch => retoValido(env, ch, 'get'));
  } catch (e) {
    await lim.fallo();
    return error(401, e.message || 'No se pudo verificar la llave de acceso.');
  }
  await guardarLlaves(env, llaves.map(k => (k.id === usada.id ? usada : k)));
  await registrar(env, request, 'ingreso', { app: cuerpo.app, detalle: `Con ${usada.nombre}` });
  const nueva = await crearSesion(env, request, { metodo: 'llave', app: !!cuerpo.app });
  return conCookies(json({ ok: true }), [nueva.cookie]);
}

/* ---------- Panel ---------- */

// Fotos: en R2 si está configurado; si no, en el mismo KV (clave media:<ruta>)
const borrarMedia = (env, keys) => Promise.all([...keys].map(k => (env.MEDIA ? env.MEDIA.delete(k) : env.DATA.delete(`media:${k}`)).catch(() => {})));

// Borra las fotos que ya no usa ninguna versión (la publicada ni las del historial).
// Las subidas que nunca se publicaron se borran después de 3 días.
async function limpiarHuerfanas(env, enUso) {
  if (env.MEDIA) return; // con R2 la limpieza se hace por reglas del bucket
  const viejas = [];
  let cursor;
  do {
    const r = await env.DATA.list({ prefix: 'media:', cursor });
    for (const k of r.keys) {
      const key = k.name.slice(6);
      if (!enUso.has(key) && Date.now() - (k.metadata?.t || 0) > 3 * 864e5) viejas.push(key);
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  if (viejas.length) await borrarMedia(env, viejas);
}

const resumenHistorial = lista => lista.map(({ id, version, publicado, disp }) => ({ id, version, publicado, disp }));

async function admin(ruta, metodo, request, env, ses) {
  if (ruta === 'contenido' && metodo === 'GET') {
    const [contenido, historial, mensajes] = await Promise.all([leerContenido(env, request), leerHistorial(env), env.DATA.get('mensajes', { type: 'json' })]);
    return json({ contenido, historial: resumenHistorial(historial), sinLeer: (mensajes || []).filter(m => !m.leido).length });
  }

  if (ruta === 'contenido' && metodo === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body?.contenido) return error(400, 'No llegó el contenido.');
    const previo = await leerContenido(env, request);
    // Si alguien publicó desde otro dispositivo mientras se editaba, se avisa en vez de pisarlo
    if (!body.forzar && body.base != null && Number(body.base) !== (previo.version || 0)) {
      return json({ error: 'Mientras editabas se publicó otra versión desde otro dispositivo.', conflicto: true, publicado: previo.publicado, disp: previo.disp }, 409);
    }
    const { contenido, faltan } = limpiarContenido(body.contenido);
    if (faltan.length) return error(400, `Falta completar ${faltan.join(' y ')}.`);
    const nuevo = await publicarContenido(env, contenido, previo, request);
    const historial = await leerHistorial(env);
    const enUso = new Set([...mediaKeys(nuevo), ...mediaKeys(historial)]);
    await limpiarHuerfanas(env, enUso).catch(e => console.error(e));
    return json({ contenido: nuevo, historial: resumenHistorial(historial) });
  }

  const mVer = ruta.match(/^historial\/([\w-]{1,60})$/);
  if (mVer && metodo === 'GET') {
    const v = (await leerHistorial(env)).find(x => x.id === mVer[1]);
    return v ? json(v) : error(404, 'Esa versión ya no está guardada.');
  }

  if (ruta === 'fotos' && metodo === 'POST') {
    const tipo = (request.headers.get('Content-Type') || '').split(';')[0];
    if (!TIPOS_FOTO[tipo]) return error(415, 'Ese formato de imagen no se puede usar. Probá con JPG, PNG o WebP.');
    const body = await request.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_FOTO) return error(413, 'La imagen pesa demasiado (máximo 8 MB).');
    if (!esImagen(new Uint8Array(body.slice(0, 12)), tipo)) return error(415, 'El archivo no es una imagen válida.');
    const mes = new Date().toISOString().slice(0, 7);
    const key = `u/${mes}/${crypto.randomUUID()}.${TIPOS_FOTO[tipo]}`;
    if (env.MEDIA) await env.MEDIA.put(key, body, { httpMetadata: { contentType: tipo, cacheControl: 'public, max-age=31536000, immutable' } });
    else await env.DATA.put(`media:${key}`, body, { metadata: { tipo, t: Date.now() } });
    return json({ url: `/media/${key}` });
  }

  if (ruta === 'mensajes' && metodo === 'GET') return json({ mensajes: (await env.DATA.get('mensajes', { type: 'json' })) || [] });
  const mMsj = ruta.match(/^mensajes\/([\w-]{1,40})$/);
  if (mMsj && (metodo === 'PATCH' || metodo === 'DELETE')) {
    const lista = (await env.DATA.get('mensajes', { type: 'json' })) || [];
    const i = lista.findIndex(m => m.id === mMsj[1]);
    if (i < 0) return error(404, 'Ese mensaje ya no existe.');
    if (metodo === 'DELETE') lista.splice(i, 1);
    else lista[i].leido = !!(await request.json().catch(() => ({}))).leido;
    await env.DATA.put('mensajes', JSON.stringify(lista));
    return json({ ok: true });
  }

  const seg = await seguridad(ruta, metodo, request, env, ses);
  if (seg) return seg;
  return error(404, 'No existe.');
}

// Revisa los primeros bytes: que el archivo sea de verdad la imagen que dice ser
function esImagen(b, tipo) {
  if (tipo === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (tipo === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (tipo === 'image/webp') return String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  return false;
}

/* ---------- Seguridad: contraseña, sesiones y llaves de acceso ---------- */

async function seguridad(ruta, metodo, request, env, ses) {
  if (ruta === 'seguridad' && metodo === 'GET') {
    const [sesiones, llaves, actividad, cambiada] = await Promise.all([listarSesiones(env), leerLlaves(env), leerActividad(env), passwordCambiada(env)]);
    return json({
      sesiones: sesiones.map(({ id, ...s }) => ({ ...s, id, actual: id === ses.id })),
      llaves: llaves.map(({ id, nombre, creada, usada }) => ({ id, nombre, creada, usada })),
      actividad,
      claveCambiada: cambiada,
    });
  }

  if (ruta === 'clave' && metodo === 'PUT') {
    const { actual, nueva } = await request.json().catch(() => ({}));
    const lim = await limites(request, env);
    if (lim.bloqueadoIp) return error(429, 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.');
    if (!(await passwordOk(env, actual))) { await lim.fallo(); return error(400, 'La contraseña actual no es correcta.'); }
    const n = String(nueva || '');
    if (n.length < 10) return error(400, 'La nueva contraseña tiene que tener al menos 10 caracteres.');
    if (n.length > 200) return error(400, 'La contraseña es demasiado larga.');
    if (n === actual) return error(400, 'La nueva contraseña tiene que ser distinta de la actual.');
    await guardarPassword(env, n);
    // Se cierran las demás sesiones: si alguien sabía la contraseña vieja, queda afuera
    const otras = (await listarSesiones(env)).filter(s => s.id !== ses.id);
    await Promise.all(otras.map(s => borrarSesion(env, s.id)));
    await registrar(env, request, 'clave');
    return json({ ok: true, cerradas: otras.length });
  }

  const mSes = ruta.match(/^sesiones\/([\w-]{1,64})$/);
  if (mSes && metodo === 'DELETE') {
    const todas = await listarSesiones(env);
    const cerrar = mSes[1] === 'otras' ? todas.filter(s => s.id !== ses.id) : todas.filter(s => s.id === mSes[1]);
    await Promise.all(cerrar.map(s => borrarSesion(env, s.id)));
    if (cerrar.length) await registrar(env, request, 'sesiones', { detalle: cerrar.length === 1 ? cerrar[0].disp : `${cerrar.length} sesiones` });
    return json({ ok: true, cerradas: cerrar.length, actual: cerrar.some(s => s.id === ses.id) });
  }

  if (ruta === 'passkeys/reto' && metodo === 'POST') {
    const llaves = await leerLlaves(env);
    return json({ reto: await nuevoReto(env, 'create'), rpId: rpId(request), excluir: llaves.map(k => k.id) });
  }
  if (ruta === 'passkeys' && metodo === 'POST') {
    const cuerpo = await request.json().catch(() => ({}));
    const llaves = await leerLlaves(env);
    if (llaves.length >= 10) return error(400, 'Ya hay 10 dispositivos con acceso rápido. Sacá alguno que no uses.');
    let nueva;
    try { nueva = await verificarRegistro(request, cuerpo, ch => retoValido(env, ch, 'create')); } catch (e) { return error(400, e.message); }
    if (llaves.some(k => k.id === nueva.id)) return error(400, 'Este dispositivo ya tiene acceso rápido.');
    const nombre = String(cuerpo.nombre || '').trim().slice(0, 40) || 'Este dispositivo';
    llaves.push({ ...nueva, nombre, creada: Date.now(), usada: null });
    await guardarLlaves(env, llaves);
    await registrar(env, request, 'llave+', { detalle: nombre });
    return json({ ok: true });
  }
  const mLlave = ruta.match(/^passkeys\/([\w-]{1,512})$/);
  if (mLlave && metodo === 'DELETE') {
    const llaves = await leerLlaves(env);
    const k = llaves.find(x => x.id === mLlave[1]);
    if (!k) return error(404, 'Ese acceso ya no existe.');
    await guardarLlaves(env, llaves.filter(x => x.id !== k.id));
    await registrar(env, request, 'llave-', { detalle: k.nombre });
    return json({ ok: true });
  }
  return null;
}
