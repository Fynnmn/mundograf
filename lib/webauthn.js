// Llaves de acceso (WebAuthn / passkeys): entrar al panel con Face ID, Touch ID o la huella del celular.
// La llave privada nunca sale del teléfono; acá solo se guarda la pública y se verifica la firma.
import { b64url, fromB64url, enc } from './core.js';

const bytes = s => Uint8Array.from(fromB64url(s), c => c.charCodeAt(0));
const sha256 = async data => new Uint8Array(await crypto.subtle.digest('SHA-256', data));
const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export const rpId = request => new URL(request.url).hostname;
const origen = request => new URL(request.url).origin;

export const leerLlaves = async env => (await env.DATA.get('passkeys', { type: 'json' })) || [];
export const guardarLlaves = (env, lista) => env.DATA.put('passkeys', JSON.stringify(lista));

// Datos del autenticador: hash del dominio (32) + banderas (1) + contador (4) + datos de la credencial
function leerAuthData(buf) {
  if (buf.length < 37) throw new Error('Datos del autenticador incompletos.');
  const flags = buf[32];
  return {
    rpIdHash: buf.slice(0, 32),
    presente: !!(flags & 0x01),
    verificado: !!(flags & 0x04),
    contador: new DataView(buf.buffer, buf.byteOffset + 33, 4).getUint32(0),
    // En el registro: aaguid (16) + largo del id (2) + id de la credencial
    credId: flags & 0x40 && buf.length >= 55 ? buf.slice(55, 55 + new DataView(buf.buffer, buf.byteOffset + 53, 2).getUint16(0)) : null,
  };
}

async function revisarComun(request, clientDataB64, authDataB64, tipo) {
  const clientRaw = bytes(clientDataB64);
  const client = JSON.parse(new TextDecoder().decode(clientRaw));
  if (client.type !== tipo) throw new Error('Tipo de operación incorrecto.');
  if (client.origin !== origen(request)) throw new Error('Origen no permitido.');
  const authRaw = bytes(authDataB64);
  const auth = leerAuthData(authRaw);
  if (!iguales(auth.rpIdHash, await sha256(enc.encode(rpId(request))))) throw new Error('La llave es de otro sitio.');
  if (!auth.presente || !auth.verificado) throw new Error('Falta confirmar con Face ID, huella o código del teléfono.');
  return { client, clientRaw, auth, authRaw };
}

// Registro. El cliente manda la llave pública en SPKI (getPublicKey()), que importamos para validarla.
export async function verificarRegistro(request, cuerpo, retoOk) {
  const { client, auth } = await revisarComun(request, cuerpo.clientDataJSON, cuerpo.authenticatorData, 'webauthn.create');
  if (!(await retoOk(client.challenge))) throw new Error('El pedido venció. Probá de nuevo.');
  const id = String(cuerpo.id || '');
  if (!auth.credId || b64url(auth.credId) !== id) throw new Error('La llave no coincide.');
  const alg = Number(cuerpo.alg);
  if (alg !== -7 && alg !== -257) throw new Error('Tipo de llave no admitido.');
  await importar(cuerpo.publicKey, alg); // falla si no es una llave válida
  return { id, publicKey: cuerpo.publicKey, alg, contador: auth.contador };
}

const importar = (spkiB64, alg) => crypto.subtle.importKey(
  'spki', bytes(spkiB64),
  alg === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  false, ['verify'],
);

// Las firmas ECDSA de WebAuthn vienen en DER; WebCrypto las quiere como r||s de 32 bytes cada uno
function derARaw(der) {
  let o = 2;
  if (der[1] & 0x80) o += der[1] & 0x7f;
  const entero = () => {
    if (der[o++] !== 0x02) throw new Error('Firma inválida.');
    const len = der[o++];
    let v = der.slice(o, o + len); o += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32); out.set(v, 32 - v.length);
    return out;
  };
  const r = entero(), s = entero();
  const raw = new Uint8Array(64); raw.set(r); raw.set(s, 32);
  return raw;
}

// Ingreso. Devuelve la llave usada con el contador actualizado.
export async function verificarIngreso(request, cuerpo, llaves, retoOk) {
  const llave = llaves.find(k => k.id === cuerpo.id);
  if (!llave) throw new Error('Esa llave de acceso ya no está habilitada.');
  const { client, clientRaw, auth, authRaw } = await revisarComun(request, cuerpo.clientDataJSON, cuerpo.authenticatorData, 'webauthn.get');
  if (!(await retoOk(client.challenge))) throw new Error('El pedido venció. Probá de nuevo.');
  const firmado = new Uint8Array(authRaw.length + 32);
  firmado.set(authRaw); firmado.set(await sha256(clientRaw), authRaw.length);
  const sig = bytes(cuerpo.signature);
  const key = await importar(llave.publicKey, llave.alg);
  const ok = llave.alg === -7
    ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derARaw(sig), firmado)
    : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, firmado);
  if (!ok) throw new Error('La firma no es válida.');
  // Un contador que no avanza indica una llave clonada (las sincronizadas por iCloud o Google siempre mandan 0)
  if ((auth.contador || llave.contador) && auth.contador <= llave.contador) throw new Error('Llave de acceso rechazada.');
  return { ...llave, contador: auth.contador, usada: Date.now() };
}
