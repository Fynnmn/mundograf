// Panel de Mundograf: editar la página, ver el cambio en vivo y publicarlo.
// Todo lo que se toca queda como borrador en este dispositivo hasta tocar "Publicar".
import { ICONOS, icono } from './iconos.js';
import { ordenable, mover } from './ordenar.js';
import { prepararFoto } from './imagenes.js';
import { soportaLlaves, hayBiometria, nombreMetodo, nombreDispositivo, cancelado, crearLlave, usarLlave } from './llaves.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clonar = o => JSON.parse(JSON.stringify(o));
const nuevoId = () => Math.random().toString(36).slice(2, 9);
const esApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ancho = q => matchMedia(q).matches;

const SVG = {
  chev: '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  asa: '<svg viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/><circle cx="5" cy="7" r="1.2"/><circle cx="9" cy="7" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="9" cy="11" r="1.2"/></g></svg>',
  mas: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  cerrar: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  x: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  subir: '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="5" width="22" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="10" cy="11" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m4 20 6-6 4 4 3-3 7 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
};

/* ---------- Secciones ---------- */

const SECCIONES = {
  portada: { nombre: 'Portada', claves: ['portada'], ancla: 'top' },
  servicios: { nombre: 'Servicios', claves: ['servicios'], ancla: 'servicios' },
  porque: { nombre: 'Por qué Mundograf', claves: ['porque'], ancla: 'por-que' },
  trabajos: { nombre: 'Trabajos', claves: ['trabajos'], ancla: 'portfolio' },
  contacto: { nombre: 'Contacto y pie', claves: ['contacto', 'pie'], ancla: 'contacto' },
  negocio: { nombre: 'Teléfono, email y redes', claves: ['negocio'], ancla: 'contacto' },
  google: { nombre: 'Cómo aparece en Google', claves: ['seo'], ancla: 'top' },
  mensajes: { nombre: 'Mensajes' },
  versiones: { nombre: 'Versiones anteriores' },
  cuenta: { nombre: 'Cuenta y seguridad' },
};
const GRUPOS = [
  ['La página', ['portada', 'servicios', 'porque', 'trabajos', 'contacto']],
  ['Datos', ['negocio', 'google']],
  ['Administración', ['mensajes', 'versiones', 'cuenta']],
];

/* ---------- Estado ---------- */

const S = {
  publicado: null,   // lo que está en la página ahora
  borrador: null,    // lo que se está editando
  base: 0,           // versión publicada sobre la que se edita
  historial: [],
  sinLeer: 0,
  ruta: '',
  abiertos: new Set(), // filas desplegadas en las listas
};
const CLAVE_BORRADOR = 'mg-borrador-v1';
const CLAVES_CONTENIDO = ['negocio', 'portada', 'servicios', 'porque', 'trabajos', 'contacto', 'pie', 'seo'];
const soloContenido = c => Object.fromEntries(CLAVES_CONTENIDO.map(k => [k, clonar(c[k])]));

/* ---------- API ---------- */

async function api(metodo, ruta, body) {
  let res;
  try {
    res = await fetch(`/api/${ruta}`, {
      method: metodo,
      headers: { 'X-Mundograf': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error(navigator.onLine ? 'No se pudo conectar. Probá de nuevo.' : 'Estás sin conexión. Los cambios quedan guardados en este dispositivo.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && ruta.startsWith('admin/')) { mostrarIngreso('Tu sesión venció. Volvé a entrar: tus cambios siguen guardados.'); throw new Error(data.error); }
  if (!res.ok) { const e = new Error(data.error || 'Algo salió mal.'); e.status = res.status; e.data = data; throw e; }
  return data;
}

function subirFoto(blob, onProgreso) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/fotos');
    xhr.setRequestHeader('X-Mundograf', '1');
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.upload.onprogress = e => e.lengthComputable && onProgreso?.(e.loaded / e.total);
    xhr.onload = () => {
      let d = {};
      try { d = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 401) mostrarIngreso('Tu sesión venció. Volvé a entrar.');
      xhr.status < 300 ? resolve(d.url) : reject(new Error(d.error || 'No se pudo subir la foto.'));
    };
    xhr.onerror = () => reject(new Error('Se cortó la conexión mientras subía la foto.'));
    xhr.send(blob);
  });
}

/* ---------- Avisos y hojas ---------- */

function aviso(texto, { error = false, accion = null, link = null, ms = 4200 } = {}) {
  const el = document.createElement('div');
  el.className = `aviso${error ? ' aviso--error' : ''}`;
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(texto)}</span>`;
  if (accion) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = accion.texto;
    b.onclick = () => { accion.hacer(); cerrar(); };
    el.append(b);
  }
  if (link) {
    const a = document.createElement('a');
    a.href = link.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = link.texto;
    el.append(a);
  }
  $('#avisos').append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  const t = setTimeout(cerrar, accion ? ms + 2500 : ms);
  function cerrar() {
    clearTimeout(t);
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }
  return cerrar;
}

let hojaAbierta = null;
function hoja({ titulo, cuerpo, pie = '', chica = false, alAbrir }) {
  hojaAbierta?.cerrar(true);
  const fondo = document.createElement('div');
  fondo.className = 'hoja-fondo';
  fondo.innerHTML = `
    <div class="hoja${chica ? ' hoja--chica' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="hoja__cabeza"><h2>${esc(titulo)}</h2><button type="button" class="icono-boton" data-cerrar aria-label="Cerrar">${SVG.cerrar}</button></div>
      <div class="hoja__cuerpo">${cuerpo}</div>
      ${pie ? `<div class="hoja__pie">${pie}</div>` : ''}
    </div>`;
  const previo = document.activeElement;
  let resolver;
  const promesa = new Promise(r => { resolver = r; });
  const control = {
    el: fondo,
    cerrar(valor) {
      if (!fondo.isConnected) return;
      fondo.classList.remove('abierta');
      document.removeEventListener('keydown', tecla);
      setTimeout(() => fondo.remove(), 320);
      if (hojaAbierta === control) hojaAbierta = null;
      previo?.focus?.({ preventScroll: true });
      resolver(valor);
    },
    promesa,
  };
  const tecla = e => { if (e.key === 'Escape') control.cerrar(false); };
  document.addEventListener('keydown', tecla);
  fondo.addEventListener('click', e => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) control.cerrar(false);
    const v = e.target.closest('[data-valor]');
    if (v) control.cerrar(v.dataset.valor);
  });
  document.body.append(fondo);
  hojaAbierta = control;
  requestAnimationFrame(() => requestAnimationFrame(() => fondo.classList.add('abierta')));
  alAbrir?.(fondo, control);
  setTimeout(() => ($('[autofocus]', fondo) || $('.hoja', fondo)).focus?.({ preventScroll: true }), 60);
  return control;
}

const confirmar = (titulo, texto, si, peligro = false) => hoja({
  titulo, chica: true,
  cuerpo: `<p>${esc(texto)}</p>`,
  pie: `<button type="button" class="boton boton--claro" data-valor="">Cancelar</button><button type="button" class="boton ${peligro ? 'boton--claro boton--peligro' : 'boton--marca'}" data-valor="si" autofocus>${esc(si)}</button>`,
}).promesa.then(v => v === 'si');

/* ---------- Fechas ---------- */

const fmtFecha = t => new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
function hace(t) {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 6) return `hace ${Math.round(s / 86400)} días`;
  return fmtFecha(t);
}

/* ---------- Ingreso ---------- */

function mostrarIngreso(msg) {
  $('#app').hidden = true;
  $('#ingreso').hidden = false;
  const err = $('#ingreso-error');
  err.hidden = !msg;
  err.textContent = msg || '';
  prepararLlaveIngreso();
  setTimeout(() => $('#password').focus(), 50);
}

async function prepararLlaveIngreso() {
  let llaves = false;
  try { llaves = (await fetch('/api/sesion').then(r => r.json())).llaves; } catch {}
  const mostrar = llaves && await hayBiometria();
  $('#entrar-llave').hidden = !mostrar;
  $('#ingreso-o').hidden = !mostrar;
  $('[data-metodo]').textContent = `Entrar con ${nombreMetodo}`;
}

$('[data-ver-clave]').addEventListener('click', e => {
  const input = $('#password');
  const ver = input.type === 'password';
  input.type = ver ? 'text' : 'password';
  e.currentTarget.textContent = ver ? 'Ocultar' : 'Mostrar';
  e.currentTarget.setAttribute('aria-pressed', String(ver));
});

$('#form-ingreso').addEventListener('submit', async e => {
  e.preventDefault();
  const boton = $('#entrar');
  const pw = $('#password').value;
  if (!pw) { $('#password').focus(); return; }
  boton.disabled = true; boton.textContent = 'Entrando…';
  try {
    await api('POST', 'login', { password: pw, app: esApp() });
    $('#password').value = '';
    await arrancar();
    ofrecerAccesoRapido();
  } catch (err) {
    const caja = $('#ingreso');
    caja.classList.remove('sacudir'); void caja.offsetWidth; caja.classList.add('sacudir');
    $('#ingreso-error').textContent = err.message;
    $('#ingreso-error').hidden = false;
    $('#password').select();
  } finally {
    boton.disabled = false; boton.textContent = 'Entrar';
  }
});

$('#entrar-llave').addEventListener('click', async () => {
  try {
    const reto = await api('POST', 'passkey/reto');
    const cred = await usarLlave(reto);
    await api('POST', 'passkey/entrar', { ...cred, app: esApp() });
    await arrancar();
  } catch (err) {
    if (cancelado(err)) return;
    $('#ingreso-error').textContent = err.message || 'No se pudo entrar. Probá con la contraseña.';
    $('#ingreso-error').hidden = false;
  }
});

async function ofrecerAccesoRapido() {
  if (!soportaLlaves() || !(await hayBiometria())) return;
  try { if (localStorage.getItem('mg-llave-ofrecida')) return; localStorage.setItem('mg-llave-ofrecida', '1'); } catch {}
  const si = await hoja({
    titulo: `Entrar con ${nombreMetodo}`, chica: true,
    cuerpo: `<p>La próxima vez entrás sin escribir la contraseña. Tu huella o tu cara no salen del dispositivo: Mundograf solo guarda una llave que no sirve en otro lado.</p>`,
    pie: '<button type="button" class="boton boton--claro" data-valor="">Ahora no</button><button type="button" class="boton boton--marca" data-valor="si">Activar</button>',
  }).promesa;
  if (si === 'si') activarLlave();
}

async function activarLlave() {
  try {
    const reto = await api('POST', 'admin/passkeys/reto');
    const cred = await crearLlave(reto);
    await api('POST', 'admin/passkeys', { ...cred, nombre: nombreDispositivo() });
    aviso(`Listo: la próxima vez entrás con ${nombreMetodo}.`);
    if (S.ruta === 'cuenta') render();
  } catch (err) {
    if (!cancelado(err)) aviso(err.message, { error: true });
  }
}

/* ---------- Arranque ---------- */

async function arrancar() {
  const d = await api('GET', 'admin/contenido');
  S.publicado = d.contenido;
  S.base = d.contenido.version || 0;
  S.historial = d.historial;
  S.sinLeer = d.sinLeer;
  S.borrador = soloContenido(d.contenido);

  // ¿Quedaron cambios sin publicar en este dispositivo?
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null'); } catch {}
  if (guardado?.contenido) {
    S.borrador = { ...S.borrador, ...guardado.contenido };
    S.borrador.trabajos.items = S.borrador.trabajos.items.filter(x => x.foto?.l); // fotos que no terminaron de subir
    if (guardado.base !== S.base) S.base = guardado.base; // se avisa al publicar si alguien publicó en el medio
    if (cambios().length) setTimeout(() => aviso('Seguís desde donde dejaste: tus cambios sin publicar están acá.'), 400);
  }

  $('#ingreso').hidden = true;
  $('#app').hidden = false;
  pintarNav();
  actualizarPublicar();
  irA(location.hash);
  prepararPrevia();
}

async function inicio() {
  try {
    const s = await fetch('/api/sesion', { credentials: 'same-origin' }).then(r => r.json());
    if (s.admin) await arrancar();
    else mostrarIngreso();
  } catch {
    mostrarIngreso('No se pudo conectar. Revisá tu internet.');
  }
}

/* ---------- Borrador y cambios ---------- */

const corte = (c, claves) => JSON.stringify(claves.map(k => c?.[k] ?? null));
function cambios() {
  if (!S.publicado || !S.borrador) return [];
  return Object.entries(SECCIONES).filter(([, s]) => s.claves && corte(S.borrador, s.claves) !== corte(S.publicado, s.claves)).map(([k]) => k);
}

let tGuardar = 0;
function cambio({ previa = true } = {}) {
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => {
    try {
      if (cambios().length) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ base: S.base, contenido: S.borrador, t: Date.now() }));
      else localStorage.removeItem(CLAVE_BORRADOR);
    } catch {}
  }, 250);
  actualizarPublicar();
  pintarNav();
  if (previa) pedirPrevia();
}

const listaNatural = arr => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} y ${arr.at(-1)}`);

function actualizarPublicar() {
  const c = cambios();
  const barra = $('#publicar');
  if (barra.dataset.estado === 'publicando') return;
  barra.dataset.estado = c.length ? 'cambios' : 'limpio';
  $('#publicar-titulo').textContent = c.length ? 'Sin publicar' : 'Todo publicado';
  $('#publicar-detalle').textContent = c.length
    ? `Cambios en ${listaNatural(c.map(k => SECCIONES[k].nombre.toLowerCase().replace(/^por qué/, 'Por qué')))}`
    : (S.publicado?.publicado ? `Última vez ${hace(S.publicado.publicado)}` : '');
  $('#publicar-btn').disabled = !c.length;
  if (previa.lista) estadoPrevia();
}

$('#descartar').addEventListener('click', async () => {
  if (!(await confirmar('¿Descartar los cambios?', 'La página queda como está publicada ahora. Lo que cambiaste desde la última publicación se pierde.', 'Descartar cambios', true))) return;
  S.borrador = soloContenido(S.publicado);
  S.base = S.publicado.version || 0;
  try { localStorage.removeItem(CLAVE_BORRADOR); } catch {}
  cambio();
  render();
  aviso('Cambios descartados.');
});

$('#publicar-btn').addEventListener('click', () => publicar(false));

async function publicar(forzar) {
  const barra = $('#publicar');
  const boton = $('#publicar-btn');
  if (subidas.size) { aviso('Esperá a que terminen de subir las fotos.'); return; }
  barra.dataset.estado = 'publicando';
  boton.textContent = 'Publicando…';
  try {
    const d = await api('PUT', 'admin/contenido', { contenido: S.borrador, base: S.base, forzar });
    S.publicado = d.contenido;
    S.base = d.contenido.version;
    S.historial = d.historial;
    S.borrador = soloContenido(d.contenido);
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch {}
    navigator.vibrate?.(12);
    aviso('Publicado. Ya se ve en la página.', { link: { href: '/', texto: 'Abrir' } });
    barra.dataset.estado = 'limpio';
    // Los campos en pantalla pasan a apuntar a lo recién publicado (sin perder la posición)
    const cuerpo = $('#vista').parentElement;
    const y = cuerpo.scrollTop;
    render();
    cuerpo.scrollTop = y;
  } catch (err) {
    barra.dataset.estado = 'cambios';
    if (err.status === 409) {
      const si = await confirmar('Hay una versión más nueva',
        `Mientras editabas se publicó otra versión${err.data?.disp ? ` desde ${err.data.disp}` : ''}${err.data?.publicado ? ` (${hace(err.data.publicado)})` : ''}. Si publicás, tus cambios la reemplazan. La otra queda en Versiones anteriores.`,
        'Publicar los míos');
      if (si) return publicar(true);
    } else aviso(err.message, { error: true });
  } finally {
    boton.textContent = 'Publicar';
    actualizarPublicar();
    pintarNav();
  }
}

/* ---------- Navegación ---------- */

function pintarNav() {
  const c = new Set(cambios());
  $('#nav').innerHTML = GRUPOS.map(([titulo, claves]) => `
    <p class="riel__grupo">${esc(titulo)}</p>
    <div class="riel__bloque">${claves.map(k => `
      <a class="riel__item" href="#/${k}"${S.ruta.split('/')[0] === k ? ' aria-current="page"' : ''}>
        <span>${esc(SECCIONES[k].nombre)}</span>
        ${k === 'mensajes' && S.sinLeer ? `<span class="cuenta" aria-label="${S.sinLeer} sin leer">${S.sinLeer}</span>` : ''}
        ${c.has(k) ? '<span class="punto" aria-label="con cambios sin publicar"></span>' : ''}
        ${SVG.chev.replace('class="chev"', 'class="flecha"')}
      </a>`).join('')}
    </div>`).join('');
}

function irA(hash) {
  let ruta = (hash || '').replace(/^#\/?/, '');
  const esCelu = ancho('(max-width: 759px)');
  if (!ruta && !esCelu) ruta = 'portada';
  if (ruta && !SECCIONES[ruta.split('/')[0]]) ruta = esCelu ? '' : 'portada';
  const antes = S.ruta.split('/')[0];
  S.ruta = ruta;
  $('#app').classList.toggle('en-seccion', !!ruta);
  pintarNav();
  render();
  const sec = SECCIONES[ruta.split('/')[0]];
  if (sec?.ancla && antes !== ruta.split('/')[0]) pedirPrevia({ ir: sec.ancla, ya: true });
}
addEventListener('hashchange', () => irA(location.hash));

$('#vista').closest('.editor__cuerpo').addEventListener('scroll', e => {
  $('#barra').classList.toggle('con-borde', e.currentTarget.scrollTop > 40);
}, { passive: true });

/* ---------- Componentes de edición ---------- */

// Un campo de texto ligado a obj[clave]. tipo: 'linea' | 'texto' | 'titulo' (admite un salto de línea)
function campo({ obj, clave, etiqueta, tipo = 'linea', max, ayuda = '', placeholder = '', prefijo = '', modo = 'text', alCambiar, autocompletar = 'off', aparte = false }) {
  const label = document.createElement('label');
  label.className = 'campo';
  const valor = obj[clave] ?? '';
  const control = tipo === 'linea'
    ? `<input class="campo__control" type="${modo}" value="${esc(valor)}" ${max ? `maxlength="${max}"` : ''} placeholder="${esc(placeholder)}" autocomplete="${autocompletar}" ${modo === 'tel' ? 'inputmode="tel"' : ''} spellcheck="${modo === 'text'}">`
    : `<textarea class="campo__control" rows="${tipo === 'titulo' ? 1 : 3}" ${max ? `maxlength="${max}"` : ''} placeholder="${esc(placeholder)}">${esc(valor)}</textarea>`;
  label.innerHTML = `
    <span class="campo__fila"><span class="campo__etiqueta">${esc(etiqueta)}</span>${max ? `<span class="campo__cuenta"></span>` : ''}</span>
    ${prefijo ? `<span class="campo__prefijo"><span>${esc(prefijo)}</span>${control}</span>` : control}
    ${ayuda ? `<span class="campo__ayuda">${ayuda}</span>` : ''}`;
  const input = $('.campo__control', label);
  const cuenta = $('.campo__cuenta', label);
  const contar = () => {
    if (!cuenta) return;
    const n = input.value.length;
    cuenta.textContent = `${n} de ${max}`;
    cuenta.classList.toggle('cerca', n > max * 0.9);
  };
  const crecer = () => {
    if (input.tagName !== 'TEXTAREA' || CSS.supports('field-sizing', 'content')) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  };
  input.addEventListener('input', () => {
    let v = input.value;
    if (tipo === 'titulo') { v = v.split('\n').slice(0, 2).join('\n'); if (v !== input.value) input.value = v; }
    obj[clave] = v;
    contar(); crecer();
    alCambiar?.(v);
    if (!aparte) cambio();
  });
  contar();
  requestAnimationFrame(crecer);
  return label;
}

function bloque(titulo, contenido, { nota = '', extra = '' } = {}) {
  const sec = document.createElement('section');
  sec.className = 'bloque';
  sec.innerHTML = `${titulo ? `<h2 class="bloque__titulo"><span>${esc(titulo)}</span>${extra ? `<small>${extra}</small>` : ''}</h2>` : ''}<div class="grupo"></div>${nota ? `<p class="bloque__nota">${nota}</p>` : ''}`;
  const g = $('.grupo', sec);
  (Array.isArray(contenido) ? contenido : [contenido]).filter(Boolean).forEach(n => g.append(n));
  return sec;
}

function cabeza(titulo, texto) {
  const h = document.createElement('header');
  h.className = 'cabeza';
  h.innerHTML = `<h1 class="cabeza__titulo">${esc(titulo)}</h1>${texto ? `<p class="cabeza__texto">${texto}</p>` : ''}`;
  return h;
}

const AYUDA_SALTO = 'Con Enter cortás la línea donde quieras. En el celular se acomoda solo.';

// Lista ordenable de elementos que se despliegan (servicios y puntos)
function listaEditable({ arr, max, nombreUno, resumen, campos, icono: conIcono = false, numerado = false, nuevo }) {
  const wrap = document.createElement('div');
  const ul = document.createElement('ul');
  ul.className = 'lista';
  wrap.append(ul);

  const pintar = () => {
    ul.innerHTML = '';
    arr.forEach((x, i) => {
      const li = document.createElement('li');
      li.className = 'fila';
      const abierta = S.abiertos.has(x.id);
      if (abierta) li.dataset.abierta = '';
      li.innerHTML = `
        <span class="fila__asa" aria-hidden="true" title="Arrastrá para ordenar">${SVG.asa}</span>
        <button type="button" class="fila__abrir" aria-expanded="${abierta}">
          ${conIcono ? `<span class="fila__icono">${icono(x.icono, 19)}</span>` : ''}
          ${numerado ? `<span class="fila__num">${String(i + 1).padStart(2, '0')}</span>` : ''}
          <span class="fila__texto"><strong>${esc(x.titulo || `${nombreUno} sin título`)}</strong><span>${esc(resumen(x))}</span></span>
        </button>
        <span class="fila__fin"><span class="fila__chevron">${SVG.chev}</span></span>`;
      $('.fila__abrir', li).addEventListener('click', () => {
        S.abiertos.has(x.id) ? S.abiertos.delete(x.id) : S.abiertos.add(x.id);
        pintar();
        if (S.abiertos.has(x.id)) setTimeout(() => ul.children[i]?.querySelector('.campo__control')?.focus({ preventScroll: true }), 30);
      });
      $('.fila__chevron', li).addEventListener('click', () => $('.fila__abrir', li).click());
      if (abierta) {
        const cuerpo = document.createElement('div');
        cuerpo.className = 'fila__cuerpo';
        campos(x, () => { const t = $('.fila__texto', li); t.querySelector('strong').textContent = x.titulo || `${nombreUno} sin título`; t.querySelector('span').textContent = resumen(x); }, li).forEach(n => cuerpo.append(n));
        const acciones = document.createElement('div');
        acciones.className = 'fila__acciones';
        acciones.innerHTML = `
          <span>
            <button type="button" class="boton boton--chico boton--borde" data-mover="-1" ${i === 0 ? 'disabled' : ''}>Subir</button>
            <button type="button" class="boton boton--chico boton--borde" data-mover="1" ${i === arr.length - 1 ? 'disabled' : ''}>Bajar</button>
          </span>
          <button type="button" class="boton boton--chico boton--claro boton--peligro" data-borrar>Borrar</button>`;
        acciones.addEventListener('click', e => {
          const m = e.target.closest('[data-mover]');
          if (m) { mover(arr, i, i + Number(m.dataset.mover)); pintar(); cambio(); return; }
          if (e.target.closest('[data-borrar]')) {
            const [quitado] = arr.splice(i, 1);
            S.abiertos.delete(quitado.id);
            pintar(); cambio();
            aviso(`Borraste “${quitado.titulo || nombreUno}”.`, { accion: { texto: 'Deshacer', hacer: () => { arr.splice(i, 0, quitado); pintar(); cambio(); } } });
          }
        });
        cuerpo.append(acciones);
        li.append(cuerpo);
      }
      ul.append(li);
    });
    agregar.disabled = arr.length >= max;
    agregar.querySelector('span').textContent = arr.length >= max ? `Máximo ${max}` : `Agregar ${nombreUno.toLowerCase()}`;
  };

  const agregar = document.createElement('button');
  agregar.type = 'button';
  agregar.className = 'agregar';
  agregar.innerHTML = `${SVG.mas}<span></span>`;
  agregar.addEventListener('click', () => {
    const x = nuevo();
    arr.push(x);
    S.abiertos.add(x.id);
    pintar(); cambio();
    setTimeout(() => ul.lastElementChild?.querySelector('.campo__control')?.focus(), 30);
  });
  wrap.append(agregar);
  ordenable(ul, { item: '.fila', asa: '.fila__asa', modo: 'lista', alSoltar: (a, b) => { mover(arr, a, b); pintar(); cambio(); } });
  pintar();
  return wrap;
}

function selectorIconos(x, alElegir) {
  const div = document.createElement('div');
  div.innerHTML = `<span class="campo__etiqueta" style="padding:12px 16px 0;display:block">Ícono</span><div class="iconos" role="group" aria-label="Ícono">${Object.entries(ICONOS).map(([k, v]) => `
    <button type="button" data-icono="${k}" aria-pressed="${x.icono === k}" title="${esc(v.nombre)}" aria-label="${esc(v.nombre)}">${icono(k, 22)}</button>`).join('')}</div>`;
  div.addEventListener('click', e => {
    const b = e.target.closest('[data-icono]');
    if (!b) return;
    x.icono = b.dataset.icono;
    $$('[data-icono]', div).forEach(n => n.setAttribute('aria-pressed', String(n === b)));
    alElegir?.();
    cambio();
  });
  return div;
}

/* ---------- Vistas ---------- */

function render() {
  const vista = $('#vista');
  const [sec, sub] = S.ruta.split('/');
  $('#barra-titulo').textContent = SECCIONES[sec]?.nombre || '';
  vista.innerHTML = '';
  if (!sec || !S.borrador) return;
  const vistas = { portada: vistaPortada, servicios: vistaServicios, porque: vistaPorque, trabajos: vistaTrabajos, contacto: vistaContacto, negocio: vistaNegocio, google: vistaGoogle, mensajes: vistaMensajes, versiones: vistaVersiones, cuenta: vistaCuenta };
  const nodos = vistas[sec](sub);
  if (nodos instanceof Promise) nodos.then(n => n && vista.append(...[].concat(n)));
  else vista.append(...[].concat(nodos));
  vista.parentElement.scrollTop = 0;
}

function vistaPortada() {
  const p = S.borrador.portada;
  const palabras = document.createElement('div');
  palabras.className = 'campo';
  const pintarPalabras = () => {
    const lista = (p.titulo || '').split(/\s+/).filter(Boolean);
    palabras.innerHTML = `<span class="campo__etiqueta">Palabra en celeste</span>
      <div class="palabras" role="group" aria-label="Palabra en celeste">${lista.map(w => `<button type="button" class="palabra" aria-pressed="${w === p.destacado}">${esc(w)}</button>`).join('')}</div>
      <span class="campo__ayuda">Tocá una palabra del título para resaltarla, como en la página. Tocala de nuevo para sacarla.</span>`;
  };
  palabras.addEventListener('click', e => {
    const b = e.target.closest('.palabra');
    if (!b) return;
    p.destacado = p.destacado === b.textContent ? '' : b.textContent;
    pintarPalabras();
    cambio();
  });
  pintarPalabras();
  return [
    cabeza('Portada', 'Lo primero que ve quien entra a la página, arriba de todo y sobre el fondo azul.'),
    bloque('Título', [
      campo({ obj: p, clave: 'titulo', etiqueta: 'Título grande', tipo: 'texto', max: 90, alCambiar: () => { if (p.destacado && !p.titulo.includes(p.destacado)) p.destacado = ''; pintarPalabras(); } }),
      palabras,
    ]),
    bloque('Textos', [
      campo({ obj: p, clave: 'etiqueta', etiqueta: 'Línea de arriba', max: 70, ayuda: 'La frase corta en la cápsula sobre el logo. Si la dejás vacía, no aparece.' }),
      campo({ obj: p, clave: 'bajada', etiqueta: 'Texto debajo del título', tipo: 'texto', max: 220 }),
      campo({ obj: p, clave: 'boton', etiqueta: 'Botón verde', max: 32, ayuda: 'Abre WhatsApp con el mensaje que pusiste en Teléfono, email y redes.' }),
    ]),
  ];
}

function vistaServicios() {
  const s = S.borrador.servicios;
  return [
    cabeza('Servicios', 'Las tarjetas numeradas de “Qué hacemos”. Arrastrá desde los puntitos para cambiar el orden.'),
    bloque('Encabezado', [
      campo({ obj: s, clave: 'titulo', etiqueta: 'Título', tipo: 'titulo', max: 80, ayuda: AYUDA_SALTO }),
      campo({ obj: s, clave: 'bajada', etiqueta: 'Texto', tipo: 'texto', max: 260 }),
    ]),
    bloque('Tarjetas', listaEditable({
      arr: s.items, max: 12, nombreUno: 'Servicio', icono: true,
      resumen: x => x.texto,
      nuevo: () => ({ id: nuevoId(), icono: 'marca', titulo: '', texto: '' }),
      campos: (x, refrescar, li) => [
        campo({ obj: x, clave: 'titulo', etiqueta: 'Nombre del servicio', max: 50, alCambiar: refrescar }),
        campo({ obj: x, clave: 'texto', etiqueta: 'Descripción', tipo: 'texto', max: 200, alCambiar: refrescar }),
        selectorIconos(x, () => { $('.fila__icono', li).innerHTML = icono(x.icono, 19); }),
      ],
    })),
  ];
}

function vistaPorque() {
  const w = S.borrador.porque;
  const cifras = document.createElement('div');
  const pintarCifras = () => {
    cifras.innerHTML = `<ul class="lista">${w.cifras.map((c, i) => `
      <li class="cifra" data-i="${i}">
        <span class="fila__asa" aria-hidden="true">${SVG.asa}</span>
        <input class="valor" value="${esc(c.valor)}" maxlength="8" aria-label="Número ${i + 1}" placeholder="0">
        <input class="etq" value="${esc(c.etiqueta)}" maxlength="30" aria-label="Qué mide el número ${i + 1}" placeholder="qué mide">
        <button type="button" class="icono-boton" data-quitar aria-label="Quitar">${SVG.cerrar}</button>
      </li>`).join('')}</ul>
      ${w.cifras.length < 4 ? `<button type="button" class="agregar">${SVG.mas}<span>Agregar número</span></button>` : ''}`;
    ordenable($('.lista', cifras), { item: '.cifra', asa: '.fila__asa', modo: 'lista', alSoltar: (a, b) => { mover(w.cifras, a, b); pintarCifras(); cambio(); } });
  };
  cifras.addEventListener('input', e => {
    const li = e.target.closest('.cifra');
    const c = w.cifras[li.dataset.i];
    if (e.target.classList.contains('valor')) c.valor = e.target.value; else c.etiqueta = e.target.value;
    cambio();
  });
  cifras.addEventListener('click', e => {
    if (e.target.closest('.agregar')) { w.cifras.push({ valor: '', etiqueta: '' }); pintarCifras(); cambio(); $$('.cifra .valor', cifras).at(-1)?.focus(); }
    const q = e.target.closest('[data-quitar]');
    if (q) {
      const i = Number(q.closest('.cifra').dataset.i);
      const [quitado] = w.cifras.splice(i, 1);
      pintarCifras(); cambio();
      aviso('Quitaste un número.', { accion: { texto: 'Deshacer', hacer: () => { w.cifras.splice(i, 0, quitado); pintarCifras(); cambio(); } } });
    }
  });
  pintarCifras();

  return [
    cabeza('Por qué Mundograf', 'La sección de fondo celeste con los números y los cuatro motivos.'),
    bloque('Encabezado', [
      campo({ obj: w, clave: 'titulo', etiqueta: 'Título', tipo: 'titulo', max: 80, ayuda: AYUDA_SALTO }),
      campo({ obj: w, clave: 'bajada', etiqueta: 'Texto', tipo: 'texto', max: 320 }),
    ]),
    bloque('Números', cifras, { nota: 'Poné solo números que puedas sostener si un cliente pregunta. Si no querés mostrar ninguno, quitalos todos y la fila desaparece.', extra: `hasta 4` }),
    bloque('Motivos', listaEditable({
      arr: w.puntos, max: 6, nombreUno: 'Motivo', numerado: true,
      resumen: x => x.texto,
      nuevo: () => ({ id: nuevoId(), titulo: '', texto: '' }),
      campos: (x, refrescar) => [
        campo({ obj: x, clave: 'titulo', etiqueta: 'Título', max: 50, alCambiar: refrescar }),
        campo({ obj: x, clave: 'texto', etiqueta: 'Texto', tipo: 'texto', max: 240, alCambiar: refrescar }),
      ],
    })),
  ];
}

/* Trabajos */

const subidas = new Map(); // id → { p: progreso, vista: url local }

function vistaTrabajos() {
  const t = S.borrador.trabajos;
  const zona = document.createElement('label');
  zona.className = 'subir';
  zona.innerHTML = `${SVG.subir}<strong>Subir fotos de trabajos</strong><span>Arrastralas acá o tocá para elegirlas. Podés subir varias juntas.</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple>`;
  const input = $('input', zona);
  input.addEventListener('change', () => { agregarFotos([...input.files]); input.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add('encima'); }));
  ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, () => zona.classList.remove('encima')));
  zona.addEventListener('drop', e => { e.preventDefault(); agregarFotos([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))); });

  const ul = document.createElement('ul');
  ul.className = 'fotos';
  const pintar = () => {
    ul.innerHTML = t.items.map(x => {
      const sub = subidas.get(x.id);
      const src = sub?.vista || x.foto.s || x.foto.l;
      return `<li class="foto${x.visible === false ? ' foto--oculta' : ''}${sub ? ' foto--subiendo' : ''}" data-id="${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(x.etiqueta || 'Foto sin título')}${x.visible === false ? ' (oculta)' : ''}. Tocá para editar, arrastrá para ordenar.">
        <img src="${esc(src)}" alt="" loading="lazy" decoding="async">
        ${x.visible === false ? '<span class="foto__oculta">Oculta</span>' : ''}
        ${sub ? `<span class="foto__progreso"><i style="--p:${sub.p}"></i></span>` : ''}
        <span class="foto__etiqueta">${esc(x.etiqueta)}</span>
      </li>`;
    }).join('');
    const vis = t.items.filter(x => x.visible !== false).length;
    const cuenta = $('[data-cuenta-fotos]');
    if (cuenta) cuenta.textContent = `${vis} en la página${t.items.length - vis ? `, ${t.items.length - vis} ocultas` : ''}`;
  };
  ul.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const li = e.target.closest('.foto'); if (li) editarFoto(li.dataset.id); }
  });
  ordenable(ul, {
    item: '.foto', modo: 'grilla',
    alSoltar: (a, b) => { mover(t.items, a, b); pintar(); cambio(); },
    alTocar: li => editarFoto(li.dataset.id),
  });
  pintar();
  vistaTrabajos.pintar = pintar;

  async function agregarFotos(files) {
    if (!files.length) return;
    const lugar = 40 - t.items.length;
    if (lugar <= 0) { aviso('Ya hay 40 fotos, que es el máximo. Borrá alguna para subir otra.', { error: true }); return; }
    if (files.length > lugar) aviso(`Se suben las primeras ${lugar}: el máximo es 40 fotos.`);
    for (const file of files.slice(0, lugar)) {
      const id = nuevoId();
      let prep;
      try { prep = await prepararFoto(file); } catch (err) { aviso(err.message, { error: true }); continue; }
      const nombre = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/^(IMG|DSC|PXL|WhatsApp Image)\s.*$/i, '').trim();
      const item = { id, visible: true, etiqueta: '', alt: nombre.length > 3 ? nombre : '', foto: { l: '', s: '', w: prep.w, h: prep.h } };
      t.items.unshift(item);
      subidas.set(id, { p: 0, vista: prep.vista });
      if (S.ruta === 'trabajos') vistaTrabajos.pintar();
      const progreso = p => { const s = subidas.get(id); if (s) { s.p = p; const i = $(`.foto[data-id="${id}"] .foto__progreso i`); i?.style.setProperty('--p', p); } };
      try {
        const [l, s] = await Promise.all([subirFoto(prep.l, p => progreso(p * 0.8)), subirFoto(prep.s)]);
        item.foto.l = l; item.foto.s = s;
        subidas.delete(id);
        cambio();
      } catch (err) {
        subidas.delete(id);
        const i = t.items.indexOf(item);
        if (i >= 0) t.items.splice(i, 1);
        aviso(err.message, { error: true });
      }
      if (S.ruta === 'trabajos') vistaTrabajos.pintar();
    }
    const sinEtiqueta = t.items.filter(x => !x.etiqueta && x.foto.l).length;
    if (sinEtiqueta) aviso('Fotos subidas. Tocá cada una para ponerle de qué trabajo es.');
  }

  return [
    cabeza('Trabajos', 'Las fotos de la sección Trabajos. Se muestran completas, sin recortes, en el orden de acá: arrastralas para reordenarlas.'),
    bloque('Encabezado', [
      campo({ obj: t, clave: 'titulo', etiqueta: 'Título', tipo: 'titulo', max: 80, ayuda: AYUDA_SALTO }),
      campo({ obj: t, clave: 'bajada', etiqueta: 'Texto', tipo: 'texto', max: 260 }),
    ]),
    (() => {
      const sec = document.createElement('section');
      sec.className = 'bloque';
      sec.innerHTML = `<h2 class="bloque__titulo"><span>Fotos</span><small data-cuenta-fotos></small></h2>`;
      sec.append(zona, ul);
      requestAnimationFrame(pintar);
      const nota = document.createElement('p');
      nota.className = 'bloque__nota';
      nota.textContent = ancho('(hover: none)') ? 'Para mover una foto, mantenela apretada un momento y arrastrala.' : 'Las fotos se achican solas antes de subir, así la página sigue cargando rápido.';
      sec.append(nota);
      return sec;
    })(),
  ];
}

function editarFoto(id) {
  const t = S.borrador.trabajos;
  const x = t.items.find(i => i.id === id);
  if (!x) return;
  const usadas = [...new Set(t.items.map(i => i.etiqueta).filter(Boolean))].slice(0, 12);
  const copia = clonar(x);
  const h = hoja({
    titulo: 'Foto',
    cuerpo: `<div class="hoja__foto"><img src="${esc(subidas.get(id)?.vista || x.foto.l)}" alt=""></div><div data-campos></div>`,
    pie: `<button type="button" class="boton boton--claro boton--peligro separar" data-borrar>Borrar</button><button type="button" class="boton boton--marca" data-cerrar>Listo</button>`,
    alAbrir(el) {
      const etq = campo({ obj: x, clave: 'etiqueta', etiqueta: 'Etiqueta', max: 40, placeholder: 'Ej.: Vinilos', ayuda: 'La palabra que aparece sobre la foto, por ejemplo “Vinilos”. Si la dejás vacía, no aparece.', alCambiar: () => marcarSug() });
      const sug = document.createElement('div');
      sug.className = 'sugerencias';
      sug.innerHTML = usadas.map(u => `<button type="button" class="sugerencia" aria-pressed="${u === x.etiqueta}">${esc(u)}</button>`).join('');
      const marcarSug = () => $$('.sugerencia', sug).forEach(b => b.setAttribute('aria-pressed', String(b.textContent === x.etiqueta)));
      sug.addEventListener('click', e => {
        const b = e.target.closest('.sugerencia');
        if (!b) return;
        x.etiqueta = b.textContent;
        $('input', etq).value = x.etiqueta;
        marcarSug(); cambio(); vistaTrabajos.pintar?.();
      });
      if (usadas.length) etq.append(sug);
      const alt = campo({ obj: x, clave: 'alt', etiqueta: 'Qué se ve en la foto', tipo: 'texto', max: 160, placeholder: 'Ej.: vinilo impreso en la vidriera de una farmacia en Fray Bentos', ayuda: 'No se ve en la página: lo leen Google y las personas ciegas. Una frase concreta alcanza.' });
      const vis = document.createElement('label');
      vis.className = 'interruptor';
      vis.innerHTML = `<span class="interruptor__texto">Mostrar en la página<small>Si la apagás, queda guardada acá pero no se ve.</small></span><input type="checkbox" ${x.visible !== false ? 'checked' : ''}>`;
      $('input', vis).addEventListener('change', e => { x.visible = e.target.checked; cambio(); vistaTrabajos.pintar?.(); });
      $('[data-campos]', el).append(bloque('', [etq, alt, vis]));
      el.addEventListener('input', () => vistaTrabajos.pintar?.());
      $('[data-borrar]', el).addEventListener('click', () => {
        const i = t.items.indexOf(x);
        t.items.splice(i, 1);
        h.cerrar(true);
        cambio(); vistaTrabajos.pintar?.();
        aviso('Borraste la foto.', { accion: { texto: 'Deshacer', hacer: () => { t.items.splice(i, 0, x); cambio(); if (S.ruta === 'trabajos') render(); } } });
      });
    },
  });
  h.promesa.then(() => { if (JSON.stringify(copia) !== JSON.stringify(x) && S.ruta === 'trabajos') render(); });
}

function vistaContacto() {
  const c = S.borrador.contacto;
  return [
    cabeza('Contacto y pie', 'El cierre de la página: la invitación a escribir y el texto del pie, junto al logo.'),
    bloque('Contacto', [
      campo({ obj: c, clave: 'titulo', etiqueta: 'Título', tipo: 'titulo', max: 80, ayuda: AYUDA_SALTO }),
      campo({ obj: c, clave: 'bajada', etiqueta: 'Texto', tipo: 'texto', max: 260, ayuda: 'Si prometés un tiempo de respuesta, que sea uno que puedan cumplir.' }),
      campo({ obj: c, clave: 'gracias', etiqueta: 'Mensaje después de enviar el formulario', max: 120 }),
    ], { nota: 'Lo que la gente manda por el formulario te llega a <a class="enlace" href="#/mensajes">Mensajes</a>.' }),
    bloque('Pie de página', campo({ obj: S.borrador.pie, clave: 'texto', etiqueta: 'Texto junto al logo', tipo: 'texto', max: 220 })),
  ];
}

function vistaNegocio() {
  const n = S.borrador.negocio;
  const wa = campo({
    obj: n, clave: 'whatsapp', etiqueta: 'WhatsApp', modo: 'tel', max: 30, autocompletar: 'tel',
    ayuda: 'Es el número de todos los botones verdes y del teléfono de la página.',
    alCambiar: () => { probar.href = `https://wa.me/${intl(n.whatsapp)}`; },
  });
  const probar = document.createElement('a');
  probar.className = 'boton boton--chico boton--borde';
  probar.target = '_blank'; probar.rel = 'noopener';
  probar.href = `https://wa.me/${intl(n.whatsapp)}`;
  probar.textContent = 'Probar';
  const fila = $('.campo__control', wa);
  const env = document.createElement('span');
  env.className = 'campo__con-accion';
  fila.replaceWith(env);
  env.append(fila, probar);

  const ciudades = document.createElement('div');
  ciudades.className = 'campo';
  const pintarCiudades = () => {
    ciudades.innerHTML = `<span class="campo__etiqueta">Ciudades</span>
      <div class="chips" style="margin-top:6px">${n.ciudades.map((c, i) => `<span class="chip">${esc(c)}<button type="button" data-i="${i}" aria-label="Quitar ${esc(c)}">${SVG.x}</button></span>`).join('')}
      ${n.ciudades.length < 4 ? '<input type="text" placeholder="Agregar ciudad" aria-label="Agregar ciudad" maxlength="40" enterkeyhint="done">' : ''}</div>
      <span class="campo__ayuda">Aparecen arriba, en Contacto y en el pie. Escribí una y apretá Enter.</span>`;
  };
  ciudades.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    n.ciudades.splice(Number(b.dataset.i), 1);
    pintarCiudades(); cambio();
  });
  ciudades.addEventListener('keydown', e => {
    if (e.target.tagName !== 'INPUT') return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = e.target.value.trim().replace(/,$/, '');
      if (v && !n.ciudades.includes(v)) { n.ciudades.push(v); pintarCiudades(); cambio(); $('input', ciudades)?.focus(); }
    } else if (e.key === 'Backspace' && !e.target.value && n.ciudades.length) {
      n.ciudades.pop(); pintarCiudades(); cambio(); $('input', ciudades)?.focus();
    }
  });
  pintarCiudades();

  return [
    cabeza('Teléfono, email y redes', 'Cambian en todos los lugares de la página donde aparecen, de una sola vez.'),
    bloque('WhatsApp', [
      wa,
      campo({ obj: n, clave: 'mensajeWa', etiqueta: 'Mensaje que ya viene escrito', tipo: 'texto', max: 200, ayuda: 'Lo que le aparece escrito a la persona cuando toca un botón de WhatsApp. Lo puede cambiar antes de mandarlo.' }),
    ]),
    bloque('Email y redes', [
      campo({ obj: n, clave: 'email', etiqueta: 'Email', modo: 'email', max: 120, autocompletar: 'email' }),
      campo({ obj: n, clave: 'instagram', etiqueta: 'Instagram', prefijo: '@', max: 60, alCambiar: v => { n.instagram = v.replace(/^@/, ''); } }),
      campo({ obj: n, clave: 'facebook', etiqueta: 'Facebook', modo: 'url', max: 200, placeholder: 'https://www.facebook.com/…', ayuda: 'El link completo de la página de Facebook.' }),
    ]),
    bloque('Dónde están', ciudades),
  ];
}

const intl = s => { const d = String(s || '').replace(/\D/g, ''); return d.startsWith('598') ? d : `598${d.replace(/^0/, '')}`; };

function vistaGoogle() {
  const g = S.borrador.seo;
  const muestra = document.createElement('div');
  muestra.className = 'google';
  muestra.setAttribute('aria-label', 'Así se vería en Google');
  const pintar = () => {
    muestra.innerHTML = `
      <div class="google__sitio"><span class="google__fav"><img src="/favicon.svg" alt=""></span><span><span class="google__nombre">Mundograf</span><br><span class="google__url">https://mundograf.com.uy</span></span></div>
      <p class="google__titulo">${esc(g.titulo || 'Sin título')}</p>
      <p class="google__desc">${esc(g.descripcion)}</p>`;
  };
  pintar();
  return [
    cabeza('Cómo aparece en Google', 'El título y la descripción que muestran Google y WhatsApp cuando alguien busca o comparte la página.'),
    bloque('Así se ve', muestra, { nota: 'Google puede tardar unos días en mostrar los cambios. A veces arma su propia descripción con textos de la página.' }),
    bloque('Textos', [
      campo({ obj: g, clave: 'titulo', etiqueta: 'Título', max: 90, ayuda: 'Hasta unos 60 caracteres se ve entero. Conviene que diga qué hacen y dónde.', alCambiar: pintar }),
      campo({ obj: g, clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', max: 160, ayuda: 'Hasta unos 155 caracteres se ve entera.', alCambiar: pintar }),
    ]),
  ];
}

/* Mensajes */

let mensajes = null;
async function vistaMensajes(id) {
  const nodos = [cabeza('Mensajes', 'Lo que la gente manda desde el formulario de contacto de la página.')];
  try { mensajes = (await api('GET', 'admin/mensajes')).mensajes; } catch (err) { aviso(err.message, { error: true }); return nodos; }
  if (S.ruta.split('/')[0] !== 'mensajes') return null;
  S.sinLeer = mensajes.filter(m => !m.leido).length;
  pintarNav();
  if (id) {
    const m = mensajes.find(x => x.id === id);
    if (!m) { location.hash = '#/mensajes'; return null; }
    if (!m.leido) { m.leido = true; S.sinLeer--; pintarNav(); api('PATCH', `admin/mensajes/${m.id}`, { leido: true }).catch(() => {}); }
    const asunto = encodeURIComponent('Tu consulta en mundograf.com.uy');
    const cuerpoMail = encodeURIComponent(`Hola ${m.nombre.split(' ')[0]}:\n\n\n\n---\nTu mensaje del ${fmtFecha(m.t)}:\n${m.mensaje}`);
    const caja = document.createElement('div');
    caja.innerHTML = `
      <p style="margin:0 0 14px"><a class="enlace" href="#/mensajes">← Todos los mensajes</a></p>
      <div class="grupo">
        <div class="mensaje-abierto">
          <div class="mensaje-abierto__de"><strong>${esc(m.nombre)}</strong><span>${esc(m.email)}</span><span>${esc(fmtFecha(m.t))}</span></div>
          <p>${esc(m.mensaje)}</p>
        </div>
        <div class="acciones">
          <a class="boton boton--marca" href="mailto:${esc(m.email)}?subject=${asunto}&body=${cuerpoMail}">Responder por email</a>
          <button type="button" class="boton boton--claro" data-noleido>Marcar como no leído</button>
          <button type="button" class="boton boton--claro boton--peligro" data-borrar>Borrar</button>
        </div>
      </div>`;
    $('[data-noleido]', caja).addEventListener('click', async () => {
      await api('PATCH', `admin/mensajes/${m.id}`, { leido: false }).catch(err => aviso(err.message, { error: true }));
      location.hash = '#/mensajes';
    });
    $('[data-borrar]', caja).addEventListener('click', async () => {
      if (!(await confirmar('¿Borrar este mensaje?', 'No se puede recuperar.', 'Borrar', true))) return;
      await api('DELETE', `admin/mensajes/${m.id}`).then(() => { aviso('Mensaje borrado.'); location.hash = '#/mensajes'; }).catch(err => aviso(err.message, { error: true }));
    });
    nodos.push(caja);
    return nodos;
  }
  if (!mensajes.length) {
    const v = document.createElement('div');
    v.className = 'grupo';
    v.innerHTML = '<div class="estado-vacio"><strong>Todavía no llegó ninguno</strong>Cuando alguien complete el formulario de la página, lo vas a ver acá.</div>';
    nodos.push(v);
    return nodos;
  }
  const lista = document.createElement('div');
  lista.className = 'grupo';
  lista.innerHTML = mensajes.map(m => `
    <a class="item${m.leido ? '' : ' item--sin-leer'}" href="#/mensajes/${esc(m.id)}">
      <span class="item__punto${m.leido ? ' item__punto--no' : ''}" aria-label="${m.leido ? '' : 'Sin leer'}"></span>
      <span class="item__cuerpo"><strong>${esc(m.nombre)}</strong><span>${esc(m.mensaje)}</span></span>
      <span class="item__fin">${esc(hace(m.t))}</span>
    </a>`).join('');
  nodos.push(bloque('', lista.children.length ? [...lista.children] : lista));
  return nodos;
}

/* Versiones */

function vistaVersiones() {
  const lista = document.createElement('div');
  lista.className = 'grupo';
  const actual = S.publicado;
  lista.innerHTML = `
    <div class="item"><span class="item__cuerpo"><strong>La que está en la página</strong><span>Publicada ${esc(actual.publicado ? hace(actual.publicado) : '')}${actual.disp ? ` desde ${esc(actual.disp)}` : ''}</span></span></div>
    ${S.historial.map(v => `
      <button type="button" class="item" data-v="${esc(v.id)}">
        <span class="item__cuerpo"><strong>${esc(v.publicado ? fmtFecha(v.publicado) : `Versión ${v.version}`)}</strong><span>${v.disp ? `Desde ${esc(v.disp)}` : 'Versión inicial'}</span></span>
        <span class="item__fin">Cargar</span>
      </button>`).join('')}`;
  lista.addEventListener('click', async e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const meta = S.historial.find(v => v.id === b.dataset.v);
    const si = await confirmar('¿Volver a esta versión?',
      `Se carga la página como estaba el ${meta.publicado ? fmtFecha(meta.publicado) : 'principio'}, como cambios sin publicar. La revisás en la vista previa y, si está bien, tocás Publicar.`,
      'Cargar esta versión');
    if (!si) return;
    try {
      const v = await api('GET', `admin/historial/${meta.id}`);
      S.borrador = soloContenido(v.contenido);
      cambio();
      aviso('Versión cargada. Revisala en la vista previa y publicá.');
      abrirPreviaCelu();
    } catch (err) { aviso(err.message, { error: true }); }
  });
  return [
    cabeza('Versiones anteriores', 'Cada vez que publicás se guarda cómo estaba antes. Si algo quedó mal, podés volver atrás.'),
    bloque('', lista, { nota: S.historial.length ? `Se guardan las últimas 15 publicaciones.` : 'Todavía no hay versiones anteriores: aparecen después de la primera publicación.' }),
  ];
}

/* Cuenta */

async function vistaCuenta() {
  const nodos = [cabeza('Cuenta y seguridad', 'Cómo se entra al panel y desde dónde está abierto.')];
  let d;
  try { d = await api('GET', 'admin/seguridad'); } catch (err) { aviso(err.message, { error: true }); return nodos; }
  if (S.ruta !== 'cuenta') return null;

  // Acceso rápido
  const bio = soportaLlaves() && (await hayBiometria());
  const rapido = document.createElement('div');
  rapido.innerHTML = `
    ${d.llaves.map(k => `
      <div class="item"><span class="item__cuerpo"><strong>${esc(k.nombre)}</strong><span>Activado ${esc(fmtFecha(k.creada))}${k.usada ? `, último uso ${esc(hace(k.usada))}` : ''}</span></span>
      <button type="button" class="boton boton--chico boton--claro boton--peligro" data-llave="${esc(k.id)}">Quitar</button></div>`).join('')}
    ${bio ? `<button type="button" class="agregar" data-activar>${SVG.mas}<span>Activar ${esc(nombreMetodo)} en este dispositivo</span></button>`
      : (!d.llaves.length ? '<div class="item"><span class="item__cuerpo"><span style="white-space:normal">Desde un celular con Face ID o huella podés entrar sin escribir la contraseña. Se activa desde acá, en ese celular.</span></span></div>' : '')}`;
  rapido.addEventListener('click', async e => {
    if (e.target.closest('[data-activar]')) return activarLlave();
    const b = e.target.closest('[data-llave]');
    if (b && await confirmar('¿Quitar este acceso?', 'Desde ese dispositivo se va a tener que entrar con la contraseña.', 'Quitar', true)) {
      await api('DELETE', `admin/passkeys/${encodeURIComponent(b.dataset.llave)}`).then(() => { aviso('Acceso quitado.'); render(); }).catch(err => aviso(err.message, { error: true }));
    }
  });
  nodos.push(bloque(`Entrar con ${nombreMetodo}`, [...rapido.children]));

  // Contraseña
  const clave = document.createElement('button');
  clave.type = 'button';
  clave.className = 'item';
  clave.innerHTML = `<span class="item__cuerpo"><strong>Cambiar la contraseña</strong><span>${d.claveCambiada ? `Cambiada ${esc(hace(d.claveCambiada))}` : 'Todavía es la que se configuró al principio'}</span></span>${SVG.chev}`;
  clave.addEventListener('click', cambiarClave);
  nodos.push(bloque('Contraseña', clave));

  // Sesiones
  const ses = document.createElement('div');
  ses.innerHTML = d.sesiones.map(s => `
    <div class="item"><span class="item__cuerpo"><strong>${esc(s.disp)}${s.actual ? ' · este' : ''}</strong><span>${esc(s.lugar)}, ${esc(hace(s.vista))}</span></span>
    ${s.actual ? '' : `<button type="button" class="boton boton--chico boton--claro" data-ses="${esc(s.id)}">Cerrar</button>`}</div>`).join('')
    + (d.sesiones.length > 1 ? '<button type="button" class="agregar" data-ses="otras"><span>Cerrar todas menos esta</span></button>' : '');
  ses.addEventListener('click', async e => {
    const b = e.target.closest('[data-ses]');
    if (!b) return;
    await api('DELETE', `admin/sesiones/${b.dataset.ses}`).then(r => { aviso(r.cerradas === 1 ? 'Sesión cerrada.' : `${r.cerradas} sesiones cerradas.`); render(); }).catch(err => aviso(err.message, { error: true }));
  });
  nodos.push(bloque('Dónde está abierto el panel', [...ses.children], { nota: 'Si ves un dispositivo que no reconocés, cerralo y cambiá la contraseña.' }));

  // Instalar
  if (!esApp() && /iPhone|iPad|Android/.test(navigator.userAgent)) {
    const ins = document.createElement('div');
    ins.className = 'item';
    ins.innerHTML = `<span class="item__cuerpo"><strong>Tenerlo como app</strong><span style="white-space:normal">${/Android/.test(navigator.userAgent) ? 'En Chrome: menú ⋮ y después “Instalar app”.' : 'En Safari: botón Compartir y después “Agregar a inicio”.'} Queda el globo de Mundograf en la pantalla del celular.</span></span>`;
    nodos.push(bloque('En el celular', ins));
  }

  // Actividad
  const NOMBRES = { ingreso: 'Entró', fallido: 'Contraseña incorrecta', clave: 'Cambió la contraseña', sesiones: 'Cerró sesiones', 'llave+': 'Activó acceso rápido', 'llave-': 'Quitó acceso rápido' };
  const act = document.createElement('div');
  act.innerHTML = d.actividad.slice(0, 12).map(a => `
    <div class="item"><span class="item__cuerpo"><strong${a.evento === 'fallido' ? ' style="color:var(--peligro)"' : ''}>${esc(NOMBRES[a.evento] || a.evento)}${a.detalle ? ` · ${esc(a.detalle)}` : ''}</strong><span>${esc(a.disp)}, ${esc(a.lugar)}</span></span><span class="item__fin">${esc(hace(a.t))}</span></div>`).join('')
    || '<div class="item"><span class="item__cuerpo"><span>Sin actividad todavía.</span></span></div>';
  nodos.push(bloque('Actividad reciente', [...act.children]));

  const salir = document.createElement('button');
  salir.type = 'button';
  salir.className = 'boton boton--claro boton--peligro boton--ancho';
  salir.textContent = 'Salir del panel';
  salir.addEventListener('click', async () => {
    if (cambios().length && !(await confirmar('¿Salir?', 'Tus cambios sin publicar quedan guardados en este dispositivo para la próxima vez.', 'Salir'))) return;
    await api('POST', 'logout').catch(() => {});
    location.hash = '';
    mostrarIngreso();
  });
  nodos.push(salir);
  return nodos;
}

function cambiarClave() {
  const datos = { actual: '', nueva: '', repetir: '' };
  const h = hoja({
    titulo: 'Cambiar la contraseña',
    cuerpo: '<div data-campos></div><p class="ingreso__error" data-error hidden></p>',
    pie: '<button type="button" class="boton boton--claro" data-cerrar>Cancelar</button><button type="button" class="boton boton--marca" data-guardar>Cambiar</button>',
    alAbrir(el) {
      const c1 = campo({ obj: datos, clave: 'actual', etiqueta: 'Contraseña actual', modo: 'password', autocompletar: 'current-password', aparte: true });
      const c2 = campo({ obj: datos, clave: 'nueva', etiqueta: 'Nueva contraseña', modo: 'password', autocompletar: 'new-password', ayuda: 'Al menos 10 caracteres. Tres o cuatro palabras sueltas funcionan bien.', aparte: true });
      const c3 = campo({ obj: datos, clave: 'repetir', etiqueta: 'Repetila', modo: 'password', autocompletar: 'new-password', aparte: true });
      $('[data-campos]', el).append(bloque('', [c1, c2, c3]));
      $('input', c1).setAttribute('autofocus', '');
      const err = $('[data-error]', el);
      $('[data-guardar]', el).addEventListener('click', async e => {
        err.hidden = true;
        if (datos.nueva.length < 10) { err.textContent = 'La nueva contraseña tiene que tener al menos 10 caracteres.'; err.hidden = false; return; }
        if (datos.nueva !== datos.repetir) { err.textContent = 'Las dos contraseñas nuevas no coinciden.'; err.hidden = false; return; }
        e.currentTarget.disabled = true;
        try {
          const r = await api('PUT', 'admin/clave', { actual: datos.actual, nueva: datos.nueva });
          h.cerrar(true);
          aviso(r.cerradas ? `Contraseña cambiada. Se cerraron ${r.cerradas} sesiones en otros dispositivos.` : 'Contraseña cambiada.');
          render();
        } catch (er) { err.textContent = er.message; err.hidden = false; e.currentTarget.disabled = false; }
      });
    },
  });
}

/* ---------- Vista previa ---------- */

const previa = { lista: false, pendiente: false, timer: 0, disp: 'compu', cargando: false, ir: '' };

function prepararPrevia() {
  if (previa.lista) return;
  previa.lista = true;
  const panel = $('#previa');
  const seg = $('.segmentos', panel);
  try { previa.disp = localStorage.getItem('mg-disp') || (ancho('(max-width: 759px)') ? 'celu' : 'compu'); } catch {}
  const elegir = disp => {
    previa.disp = disp;
    panel.dataset.disp = disp;
    $$('[data-disp]', seg).forEach((b, i) => { b.setAttribute('aria-checked', String(b.dataset.disp === disp)); if (b.dataset.disp === disp) seg.dataset.i = i; });
    escalar();
    try { localStorage.setItem('mg-disp', disp); } catch {}
  };
  seg.addEventListener('click', e => { const b = e.target.closest('[data-disp]'); if (b && b.dataset.disp !== previa.disp) { elegir(b.dataset.disp); pedirPrevia({ ya: true }); } });
  elegir(previa.disp);
  new ResizeObserver(escalar).observe($('#escenario'));
  $('#ver-previa').addEventListener('click', abrirPreviaCelu);
  $('#previa-cerrar').addEventListener('click', cerrarPreviaCelu);
  $$('#previa iframe').forEach(f => f.addEventListener('load', () => alCargar(f)));
  pedirPrevia({ ya: true, ir: SECCIONES[S.ruta.split('/')[0]]?.ancla });
}

function escalar() {
  const esc_ = $('#escenario');
  const marco = $('#marco');
  const W = esc_.clientWidth, H = esc_.clientHeight;
  if (!W || !H) return;
  if (previa.disp === 'celu') {
    const w = 390, h = 844;
    const k = Math.min(1, (W - 48) / w, (H - 48) / h);
    Object.assign(marco.style, { width: `${w}px`, height: `${h}px`, transform: `translateX(-50%) scale(${k})` });
  } else {
    const w = Math.max(1280, W), k = W / w;
    Object.assign(marco.style, { width: `${w}px`, height: `${H / k}px`, transform: `translateX(-50%) scale(${k})` });
  }
}

const previaVisible = () => ancho('(min-width: 1180px)') || $('#previa').classList.contains('abierta');

function pedirPrevia({ ya = false, ir = '' } = {}) {
  if (!previa.lista || !S.borrador) return;
  if (ir) previa.ir = ir;
  if (!previaVisible()) { previa.pendiente = true; return; }
  clearTimeout(previa.timer);
  previa.timer = setTimeout(enviarPrevia, ya ? 0 : 450);
  estadoPrevia();
}

function enviarPrevia() {
  if (previa.cargando) { previa.pendiente = true; return; }
  previa.pendiente = false;
  previa.cargando = true;
  const activo = $('#previa iframe.activo');
  const otro = $$('#previa iframe').find(f => f !== activo);
  let scroll = 0;
  try { scroll = activo.contentWindow.scrollY || 0; } catch {}
  const form = $('#form-previa');
  form.target = otro.name;
  form.contenido.value = JSON.stringify(S.borrador);
  form.scroll.value = String(scroll);
  form.ir.value = previa.ir;
  previa.ir = '';
  otro.dataset.esperando = '1';
  form.submit();
  estadoPrevia();
}

function alCargar(f) {
  if (!f.dataset.esperando) return;
  delete f.dataset.esperando;
  previa.cargando = false;
  $$('#previa iframe').forEach(x => { const act = x === f; x.classList.toggle('activo', act); x.tabIndex = act ? 0 : -1; x.setAttribute('aria-hidden', String(!act)); });
  // ¿Se cortó la sesión? La vista previa lo dice en texto plano
  try {
    const doc = f.contentDocument;
    if (doc && !doc.documentElement.hasAttribute('data-vista-previa') && /sesión/i.test(doc.body?.textContent || '')) mostrarIngreso('Tu sesión venció. Volvé a entrar: tus cambios siguen guardados.');
  } catch {}
  if (previa.pendiente) enviarPrevia();
  estadoPrevia();
}

function estadoPrevia() {
  const e = $('#previa-estado');
  const c = cambios().length;
  e.className = `previa__estado${previa.cargando ? ' cargando' : c ? ' borrador' : ''}`;
  e.textContent = previa.cargando ? 'Actualizando…' : c ? 'Con tus cambios sin publicar' : 'Igual a la página publicada';
}

function abrirPreviaCelu() {
  const p = $('#previa');
  p.classList.add('abierta');
  history.pushState({ previa: 1 }, '', location.hash || '#/');
  pedirPrevia({ ya: true, ir: previa.pendiente ? SECCIONES[S.ruta.split('/')[0]]?.ancla : '' });
  setTimeout(escalar, 20);
}
function cerrarPreviaCelu(desdeHistorial) {
  const p = $('#previa');
  if (!p.classList.contains('abierta')) return;
  p.classList.remove('abierta');
  if (desdeHistorial !== true && history.state?.previa) history.back();
}
addEventListener('popstate', () => cerrarPreviaCelu(true));
addEventListener('keydown', e => { if (e.key === 'Escape' && !hojaAbierta) cerrarPreviaCelu(); });
matchMedia('(min-width: 1180px)').addEventListener('change', e => { if (e.matches) { $('#previa').classList.remove('abierta'); pedirPrevia({ ya: true }); } });
matchMedia('(max-width: 759px)').addEventListener('change', () => irA(location.hash));

/* ---------- Otros ---------- */

// Aviso al cerrar la pestaña con fotos subiendo
addEventListener('beforeunload', e => { if (subidas.size) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('online', () => aviso('Volvió la conexión.'));
addEventListener('offline', () => aviso('Estás sin conexión. Podés seguir editando: publicás cuando vuelva.', { error: true }));
// Refresca "Última vez hace…" de a ratos
setInterval(() => { if (S.publicado) actualizarPublicar(); }, 60000);

if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});

inicio();
