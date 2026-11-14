// Fotos en el navegador: se achican y se pasan a WebP antes de subir (cargan rápido en la página).
// Se guardan dos tamaños: 1600 px para pantallas grandes y 800 px para el celular.

async function abrir(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error(/hei[cf]/i.test(file.type + file.name)
      ? 'Esa foto está en formato HEIC. Subila desde el iPhone (se convierte sola) o exportala como JPG.'
      : 'No se pudo abrir esa imagen.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function lienzo(fuente, max) {
  const k = Math.min(1, max / Math.max(fuente.width, fuente.height));
  const c = document.createElement('canvas');
  c.width = Math.round(fuente.width * k);
  c.height = Math.round(fuente.height * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, 0, 0, c.width, c.height);
  return c;
}

const aBlob = canvas => new Promise(res => canvas.toBlob(b => {
  if (b && b.type === 'image/webp') return res(b);
  canvas.toBlob(res, 'image/jpeg', 0.86); // Safari viejo no exporta WebP
}, 'image/webp', 0.84));

export async function prepararFoto(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error('Esa foto pesa más de 40 MB. Probá con una más chica.');
  const img = await abrir(file);
  if (img.width < 400 || img.height < 300) throw new Error('Esa foto es muy chica: se vería borrosa. Usá una de al menos 1200 px de ancho.');
  const l = lienzo(img, 1600);
  const s = lienzo(img, 800);
  const [bl, bs] = await Promise.all([aBlob(l), aBlob(s)]);
  img.close?.();
  return { l: bl, s: bs, w: l.width, h: l.height, vista: URL.createObjectURL(bs) };
}
