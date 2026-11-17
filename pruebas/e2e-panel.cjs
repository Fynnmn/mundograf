// Prueba de punta a punta del panel (solo en local, con la clave de prueba de .dev.vars).
// node pruebas/e2e-panel.cjs http://localhost:8797
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.USERPROFILE || process.env.HOME, '.claude/skills/gstack/node_modules/playwright'));

const BASE = process.argv[2] || 'http://localhost:8797';
const VARS = fs.readFileSync(path.join(__dirname, '..', '.dev.vars'), 'utf8');
const PANEL = (VARS.match(/PANEL_RUTA=(.*)/)?.[1] || 'admin').trim();
const CLAVE = VARS.match(/PANEL_CLAVE_PRUEBA=(.*)/)[1].trim();
const res = [];
const ok = (nombre, cond, extra = '') => { res.push(`${cond ? 'OK  ' : 'MAL '} ${nombre}${extra ? ` (${extra})` : ''}`); };
const textoPagina = async page => (await page.request.get(`${BASE}/`)).text();
const esperarGuardado = page => page.waitForFunction(() => document.querySelector('.riel__estado [data-estado]')?.textContent === 'Todo guardado', null, { timeout: 10000 });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));

  // Sin sesión
  ok('admin sin sesión responde 401', (await page.request.get(`${BASE}/api/admin/contenido`)).status() === 401);
  const rAdmin = await page.request.get(`${BASE}/admin/`);
  ok('/admin/ no existe', PANEL === 'admin' || rAdmin.status() === 404, String(rAdmin.status()));
  ok('escritura sin encabezado propio responde 403', (await page.request.put(`${BASE}/api/admin/contenido`, { data: {} })).status() === 403);

  // Sin link: no entra
  await page.goto(`${BASE}/${PANEL}/`);
  await page.waitForSelector('#ingreso:not([hidden])');
  ok('sin el link pide abrir el link', /abrí el link/i.test(await page.textContent('#ingreso-texto')));
  ok('no hay campo de contraseña', !(await page.$('input[type="password"]')));

  await page.goto(`${BASE}/${PANEL}/#clave=un-link-viejo-que-no-sirve-123`);
  await page.waitForFunction(() => /no es válido/.test(document.querySelector('#ingreso-texto')?.textContent || ''));
  ok('un link inválido no entra', true);

  // Con el link: entra, y la clave no queda en la dirección
  await page.goto(`${BASE}/${PANEL}/#clave=${CLAVE}`);
  await page.waitForSelector('#app:not([hidden])');
  ok('entra con el link', true);
  ok('la clave desaparece de la dirección', !page.url().includes('clave='));

  // Queda recordado: otra pestaña, sin el link, entra directo
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/${PANEL}/`);
  await p2.waitForSelector('#app:not([hidden])', { timeout: 8000 }).then(() => ok('el dispositivo queda recordado', true)).catch(() => ok('el dispositivo queda recordado', false));
  await p2.close();

  // Editar en el formulario: se guarda solo, sin botón Publicar
  await page.goto(`${BASE}/${PANEL}/#/servicios`);
  await page.waitForSelector('.fila');
  ok('no hay botón Publicar', !(await page.$('#publicar-btn')));
  await page.locator('.fila__abrir').first().click();
  const input = page.locator('.fila__cuerpo input.campo__control').first();
  const viejo = await input.inputValue();
  await input.fill('Logos y marcas con carácter');
  await page.waitForFunction(() => /Guardando/.test(document.querySelector('.riel__estado [data-estado]')?.textContent || ''), null, { timeout: 3000 })
    .then(() => ok('muestra "Guardando…"', true)).catch(() => ok('muestra "Guardando…"', false));
  await esperarGuardado(page);
  ok('muestra "Todo guardado"', true);
  ok('el cambio ya está en la página', (await textoPagina(page)).includes('Logos y marcas con carácter'));

  // Deshacer con Ctrl+Z (fuera de un campo)
  await page.locator('.cabeza__titulo').click();
  await page.keyboard.press('Control+z');
  await esperarGuardado(page);
  ok('Ctrl+Z deshace y se guarda', (await textoPagina(page)).includes(`<span data-c`) === false && (await textoPagina(page)).includes(`<h3>${viejo}</h3>`));

  // Escribir directo sobre la vista previa
  await page.goto(`${BASE}/${PANEL}/#/portada`);
  await page.waitForFunction(() => document.querySelector('#previa iframe.activo')?.contentDocument?.querySelector('[data-c="portada.boton"]'), null, { timeout: 10000 });
  const marco = page.frameLocator('#previa iframe.activo');
  const boton = marco.locator('[data-c="portada.boton"]');
  await boton.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ya');
  await marco.locator('[data-c="portada.bajada"]').click(); // sale del texto
  await esperarGuardado(page);
  ok('escribir sobre la página se guarda', (await textoPagina(page)).includes('Pedí tu presupuesto ya'));
  ok('el formulario se pone al día', (await page.locator('.campo__control').evaluateAll(els => els.some(e => e.value === 'Pedí tu presupuesto ya'))));
  // Lo dejamos como estaba
  await page.locator('.cabeza__titulo').click();
  await page.keyboard.press('Control+z');
  await esperarGuardado(page);
  ok('Deshacer también vuelve atrás lo escrito encima', !(await textoPagina(page)).includes('Pedí tu presupuesto ya'));

  // Subidas y seguridad del contenido
  const falso = await page.evaluate(async () => (await fetch('/api/admin/fotos', { method: 'POST', headers: { 'X-Mundograf': '1', 'Content-Type': 'image/jpeg' }, body: new Blob(['<script>alert(1)</script>']) })).status);
  ok('un archivo falso se rechaza', falso === 415, String(falso));
  const xss = await page.evaluate(async () => {
    const c = (await (await fetch('/api/admin/contenido')).json()).contenido;
    const original = c.pie.texto;
    c.pie.texto = '<img src=x onerror=alert(1)>';
    const put = b => fetch('/api/admin/contenido', { method: 'PUT', headers: { 'X-Mundograf': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ contenido: b }) });
    await put(c);
    const html = await (await fetch('/')).text();
    c.pie.texto = original;
    await put(c);
    return html.includes('&lt;img src=x') && !html.includes('<img src=x');
  });
  ok('el texto con HTML se muestra escapado', xss);

  // "Olvidar este dispositivo"
  await page.goto(`${BASE}/${PANEL}/#/cuenta`);
  await page.locator('text=Olvidar este dispositivo').click();
  await page.locator('.hoja [data-valor="si"]').click();
  await page.waitForSelector('#ingreso:not([hidden])');
  ok('"Olvidar este dispositivo" cierra el panel', (await page.request.get(`${BASE}/api/admin/contenido`)).status() === 401);

  ok('sin errores de JavaScript', !errores.length, errores.join(' | '));
  await browser.close();
  console.log(res.join('\n'));
  process.exit(res.some(r => r.startsWith('MAL')) ? 1 : 0);
})().catch(e => { console.error(e); console.log(res.join('\n')); process.exit(1); });
