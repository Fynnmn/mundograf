// Arma la carpeta dist/ que se publica en Cloudflare Pages: node build.mjs
// - dist/index.html: la página con el contenido inicial (respaldo si la Function no respondiera).
// - lib/plantilla.gen.js: la plantilla empaquetada para la Function de la portada.
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { renderPagina } from './lib/render.js';
import { limpiarContenido } from './lib/core.js';

const raiz = fileURLToPath(new URL('.', import.meta.url));
const r = (...p) => join(raiz, ...p);
const dist = r('dist');

const plantilla = readFileSync(r('plantilla.html'), 'utf8');
const seed = JSON.parse(readFileSync(r('data/contenido.json'), 'utf8'));
const { contenido, faltan } = limpiarContenido(seed);
if (faltan.length) throw new Error(`Al contenido inicial le falta: ${faltan.join(', ')}`);

writeFileSync(r('lib/plantilla.gen.js'), `// Generado por build.mjs a partir de plantilla.html. No editar a mano.\nexport default ${JSON.stringify(plantilla)};\n`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

writeFileSync(join(dist, 'index.html'), renderPagina(plantilla, contenido));
for (const f of ['favicon.svg', 'og-image.jpg', 'robots.txt', 'sitemap.xml']) cpSync(r(f), join(dist, f));
for (const f of readdirSync(r('assets')).filter(f => /^p\d+\.jpg$/.test(f))) cpSync(r('assets', f), join(dist, 'assets', f));
cpSync(r('js'), join(dist, 'js'), { recursive: true });
cpSync(r('data'), join(dist, 'data'), { recursive: true });
cpSync(r('admin'), join(dist, 'admin'), { recursive: true });
cpSync(r('lib/iconos.js'), join(dist, 'admin/iconos.js'));

// Panel: el logo vectorial se inserta una sola vez (lo usan el ingreso y el menú)
const logo = plantilla.match(/<svg class="brand-logo" viewBox="240 420 960 130"[^>]*>(<g [\s\S]*?<\/g>)<\/svg>/)[1];
writeFileSync(join(dist, 'admin/index.html'), readFileSync(r('admin/index.src.html'), 'utf8').replace('%%LOGO%%', logo));
rmSync(join(dist, 'admin/index.src.html'));

// Encabezados de seguridad de los archivos estáticos (la portada y la vista previa los ponen las Functions)
// El panel (dist/admin/) se sirve solo por la dirección secreta: los encabezados los pone functions/[[path]].js
writeFileSync(join(dist, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=(), browsing-topics=()

/assets/*
  Cache-Control: public, max-age=2592000

/admin/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-cache

/data/*
  X-Robots-Tag: noindex
`);

// Qué pasa por las Functions: todo menos los archivos estáticos públicos (así no se gastan invocaciones)
writeFileSync(join(dist, '_routes.json'), JSON.stringify({
  version: 1,
  include: ['/*'],
  exclude: ['/assets/*', '/js/*', '/favicon.svg', '/og-image.jpg', '/robots.txt', '/sitemap.xml'],
}, null, 2));

console.log('dist/ listo');
