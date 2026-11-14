// Arma la página a partir de plantilla.html y del contenido (el que está publicado o un borrador del panel).
// Lo usan las dos puntas: build.mjs (para la versión estática de respaldo) y la Function de la portada.
import { icono } from './iconos.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parrafo = s => esc(s).replace(/\n/g, '<br>');
const dos = i => String(i + 1).padStart(2, '0');

export const intl = s => {
  const d = String(s || '').replace(/\D/g, '');
  return d.startsWith('598') ? d : `598${d.replace(/^0/, '')}`;
};

function tituloConDestacado(titulo, destacado) {
  const t = esc(titulo);
  const d = esc(destacado || '').trim();
  if (!d || !t.includes(d)) return t;
  const i = t.indexOf(d);
  return `${t.slice(0, i)}<span class="accent">${d}</span>${t.slice(i + d.length)}`;
}

const servicios = items => items.map((x, i) => `
        <article class="service-card reveal">
          <span class="service-num">${dos(i)}</span>
          <div class="service-icon">${icono(x.icono)}</div>
          <h3>${esc(x.titulo)}</h3>
          <p>${parrafo(x.texto)}</p>
        </article>`).join('');

const cifras = items => items.map(x => `<div><div class="stat-value">${esc(x.valor)}</div><div class="stat-label">${esc(x.etiqueta)}</div></div>`).join('');

const puntos = items => items.map((x, i) => `
        <div class="why-point reveal">
          <span class="why-point-num">${dos(i)}</span>
          <div>
            <h4>${esc(x.titulo)}</h4>
            <p>${parrafo(x.texto)}</p>
          </div>
        </div>`).join('');

// Arma las filas para el ancho de escritorio (1152 px útiles): se suman fotos hasta llenar el ancho
// a ~260 px de alto; cada fila después se estira justo al ancho. La última, si queda corta, no se estira.
const ANCHO = 1152, ALTO = 260, GAP = 16;
function filas(items) {
  const out = [];
  let fila = [], suma = 0;
  for (const x of items) {
    fila.push(x);
    suma += x.foto.w / x.foto.h;
    if (suma * ALTO + (fila.length - 1) * GAP >= ANCHO) { out.push({ fotos: fila, corta: false }); fila = []; suma = 0; }
  }
  if (fila.length) {
    // La última fila no se estira: usa la altura promedio de las otras, así no queda más grande
    const altos = out.map(f => (ANCHO - (f.fotos.length - 1) * GAP) / f.fotos.reduce((a, x) => a + x.foto.w / x.foto.h, 0));
    const alto = altos.length ? altos.reduce((a, b) => a + b, 0) / altos.length : ALTO;
    out.push({ fotos: fila, corta: true, alto });
  }
  return out;
}

const trabajo = (x, alto) => {
  const f = x.foto;
  const r = (f.w / f.h).toFixed(3);
  const ancho = alto ? `;--w:${((f.w / f.h) * alto / ANCHO * 100).toFixed(2)}%` : '';
  const srcset = f.s && f.s !== f.l ? ` srcset="${esc(f.s)} 800w, ${esc(f.l)} 1600w" sizes="(max-width: 540px) 100vw, 50vw"` : '';
  return `
          <figure class="portfolio-item reveal" style="--r:${r}${ancho}">
            <img src="${esc(f.l)}"${srcset} alt="${esc(x.alt || x.etiqueta)}" loading="lazy" decoding="async" width="${f.w}" height="${f.h}">
            ${x.etiqueta ? `<figcaption class="ph-label">${esc(x.etiqueta)}</figcaption>` : ''}
          </figure>`;
};

const trabajos = items => filas(items.filter(x => x.visible !== false && x.foto)).map(f => `
        <div class="portfolio-row${f.corta ? ' portfolio-row--corta' : ''}">${f.fotos.map(x => trabajo(x, f.alto)).join('')}
        </div>`).join('');

function jsonLd(c, origen) {
  const N = c.negocio;
  const sameAs = [N.instagram && `https://www.instagram.com/${N.instagram}/`, N.facebook].filter(Boolean);
  const negocio = {
    '@type': ['ProfessionalService', 'LocalBusiness'],
    '@id': `${origen}/#business`,
    name: 'Mundograf',
    url: `${origen}/`,
    image: `${origen}/og-image.jpg`,
    logo: `${origen}/favicon.svg`,
    description: c.seo.descripcion,
    telephone: N.whatsapp ? `+${intl(N.whatsapp)}` : undefined,
    email: N.email || undefined,
    currenciesAccepted: 'UYU',
    knowsLanguage: 'es',
    address: { '@type': 'PostalAddress', addressLocality: N.ciudades[0] || 'Fray Bentos', addressRegion: 'Río Negro', addressCountry: 'UY' },
    areaServed: [...N.ciudades.map(name => ({ '@type': 'City', name })), { '@type': 'Country', name: 'Uruguay' }],
    sameAs: sameAs.length ? sameAs : undefined,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Servicios de Mundograf',
      itemListElement: c.servicios.items.map(s => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.titulo } })),
    },
  };
  const sitio = { '@type': 'WebSite', '@id': `${origen}/#website`, url: `${origen}/`, name: 'Mundograf', inLanguage: 'es-UY', publisher: { '@id': `${origen}/#business` } };
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [negocio, sitio] }, null, 2).replace(/</g, '\\u003c');
}

/**
 * plantilla: texto de plantilla.html. c: contenido limpio.
 * opciones: origen (https://dominio), extraHead / extraBody (HTML que se agrega, por ejemplo en la vista previa), robots.
 */
export function renderPagina(plantilla, c, { origen = 'https://mundograf.com.uy', extraHead = '', extraBody = '', robots, htmlAttr = '' } = {}) {
  const N = c.negocio;
  const msg = N.mensajeWa ? `?text=${encodeURIComponent(N.mensajeWa)}` : '';
  const valores = {
    origen,
    robots: robots || 'index, follow, max-image-preview:large, max-snippet:-1',
    anio: String(new Date().getFullYear()),
    waIntl: intl(N.whatsapp),
    waUrl: `https://wa.me/${intl(N.whatsapp)}${msg}`,
    waSolo: `https://wa.me/${intl(N.whatsapp)}`,
    igUrl: N.instagram ? `https://instagram.com/${N.instagram}` : '#contacto',
    ciudadesTxt: N.ciudades.join(' · '),
  };
  const crudos = {
    jsonld: jsonLd(c, origen),
    extraHead,
    extraBody,
    htmlAttr,
    tituloPortada: tituloConDestacado(c.portada.titulo, c.portada.destacado),
    listaServicios: servicios(c.servicios.items),
    listaCifras: cifras(c.porque.cifras),
    listaPuntos: puntos(c.porque.puntos),
    listaTrabajos: trabajos(c.trabajos.items),
    listaCiudades: N.ciudades.map(x => `<span>${esc(x)}</span>`).join('\n          '),
  };
  const ruta = k => k.split('.').reduce((o, p) => (o == null ? o : o[p]), c);
  return plantilla
    .replace(/\{\{\{([\w.]+)\}\}\}/g, (_, k) => (k in crudos ? crudos[k] : parrafo(ruta(k) ?? '')))
    .replace(/\{\{([\w.]+)\}\}/g, (_, k) => esc(k in valores ? valores[k] : ruta(k) ?? ''));
}
