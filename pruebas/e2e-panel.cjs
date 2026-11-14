// Prueba de punta a punta del panel (solo en local, con la contraseña de prueba de .dev.vars).
// node pruebas/e2e-panel.cjs http://127.0.0.1:8796
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(process.env.USERPROFILE || process.env.HOME, '.claude/skills/gstack/node_modules/playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8796';
const PW = fs.readFileSync(path.join(__dirname, '..', '.dev.vars'), 'utf8').match(/ADMIN_PASSWORD=(.*)/)[1].trim();
const PANEL = (fs.readFileSync(path.join(__dirname, '..', '.dev.vars'), 'utf8').match(/PANEL_RUTA=(.*)/)?.[1] || 'admin').trim();
const res = [];
const ok = (nombre, cond, extra = '') => { res.push(`${cond ? 'OK  ' : 'MAL '} ${nombre}${extra ? ` (${extra})` : ''}`); };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));

  // Sin sesión: todo lo de admin rechaza
  const r401 = await page.request.get(`${BASE}/api/admin/contenido`);
  ok('admin sin sesión responde 401', r401.status() === 401);
  const rAdmin = await page.request.get(`${BASE}/admin/`);
  ok('/admin/ no existe', PANEL === 'admin' || rAdmin.status() === 404, String(rAdmin.status()));
  const r403 = await page.request.put(`${BASE}/api/admin/contenido`, { data: {} });
  ok('escritura sin encabezado propio responde 403', r403.status() === 403);

  await page.goto(`${BASE}/${PANEL}/`);
  await page.fill('#password', 'cualquiera-mal');
  await page.click('#entrar');
  await page.waitForSelector('#ingreso-error:not([hidden])');
  ok('contraseña mala muestra error', /no es correcta/.test(await page.textContent('#ingreso-error')));

  await page.fill('#password', PW);
  await page.click('#entrar');
  await page.waitForSelector('#app:not([hidden])');
  await page.locator('.hoja-fondo [data-valor=""]').click({ timeout: 3000 }).catch(() => {});
  ok('entra con la contraseña correcta', true);

  // Editar un servicio y publicar
  await page.goto(`${BASE}/${PANEL}/#/servicios`);
  await page.waitForSelector('.fila');
  await page.locator('.fila__abrir').first().click();
  const input = page.locator('.fila__cuerpo input.campo__control').first();
  const viejo = await input.inputValue();
  await input.fill('Logos y marcas con carácter');
  await page.waitForSelector('#publicar[data-estado="cambios"]');
  ok('aparece la barra de publicar', true);
  await page.waitForFunction(() => document.querySelector('#previa iframe.activo')?.contentDocument?.body?.innerText.includes('LOGOS Y MARCAS CON CARÁCTER'), null, { timeout: 8000 })
    .then(() => ok('la vista previa muestra el cambio', true)).catch(() => ok('la vista previa muestra el cambio', false));
  await page.click('#publicar-btn');
  await page.waitForSelector('#publicar[data-estado="limpio"]');
  const html = await (await page.request.get(`${BASE}/`)).text();
  ok('la página publicada tiene el cambio', html.includes('Logos y marcas con carácter'));

  // Volver a dejarlo como estaba
  await page.locator('.fila__cuerpo input.campo__control').first().fill(viejo);
  await page.click('#publicar-btn');
  await page.waitForSelector('#publicar[data-estado="limpio"]');

  // Subidas: un archivo que no es imagen se rechaza
  const falso = await page.evaluate(async () => (await fetch('/api/admin/fotos', { method: 'POST', headers: { 'X-Mundograf': '1', 'Content-Type': 'image/jpeg' }, body: new Blob(['<script>alert(1)</script>']) })).status);
  ok('un archivo falso se rechaza', falso === 415, String(falso));

  // Contenido con HTML: se escapa en la página
  const xss = await page.evaluate(async () => {
    const c = (await (await fetch('/api/admin/contenido')).json()).contenido;
    const original = c.pie.texto;
    c.pie.texto = '<img src=x onerror=alert(1)>';
    await fetch('/api/admin/contenido', { method: 'PUT', headers: { 'X-Mundograf': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ contenido: c, forzar: true }) });
    const html = await (await fetch('/')).text();
    c.pie.texto = original;
    await fetch('/api/admin/contenido', { method: 'PUT', headers: { 'X-Mundograf': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ contenido: c, forzar: true }) });
    return html.includes('&lt;img src=x') && !html.includes('<img src=x');
  });
  ok('el texto con HTML se muestra escapado', xss);

  // Acceso con huella / Face ID usando un autenticador virtual
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const reg = await page.evaluate(async PANEL => {
    const m = await import(`/${PANEL}/llaves.js`);
    const reto = await (await fetch('/api/admin/passkeys/reto', { method: 'POST', headers: { 'X-Mundograf': '1' } })).json();
    const cred = await m.crearLlave(reto);
    const r = await fetch('/api/admin/passkeys', { method: 'POST', headers: { 'X-Mundograf': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cred, nombre: 'Prueba automática' }) });
    return r.status;
  }, PANEL);
  ok('registra un acceso con huella', reg === 200, String(reg));
  await page.evaluate(() => fetch('/api/logout', { method: 'POST', headers: { 'X-Mundograf': '1' } }));
  await page.goto(`${BASE}/${PANEL}/`);
  await page.waitForSelector('#entrar-llave:not([hidden])', { timeout: 5000 }).then(() => ok('ofrece entrar con huella', true)).catch(() => ok('ofrece entrar con huella', false));
  await page.click('#entrar-llave').catch(() => {});
  await page.waitForSelector('#app:not([hidden])', { timeout: 8000 }).then(() => ok('entra con huella', true)).catch(() => ok('entra con huella', false));

  // Limpieza: se quita la llave de prueba
  await page.evaluate(async () => {
    const d = await (await fetch('/api/admin/seguridad')).json();
    for (const k of (d.llaves || []).filter(k => k.nombre === 'Prueba automática')) await fetch(`/api/admin/passkeys/${encodeURIComponent(k.id)}`, { method: 'DELETE', headers: { 'X-Mundograf': '1' } });
  });

  ok('sin errores de JavaScript', !errores.length, errores.join(' | '));
  await browser.close();
  console.log(res.join('\n'));
  process.exit(res.some(r => r.startsWith('MAL')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
