// Llaves de acceso (passkeys): Face ID, Touch ID o huella en lugar de la contraseña.
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export const soportaLlaves = () => !!(window.PublicKeyCredential && navigator.credentials?.create);

export async function hayBiometria() {
  try { return soportaLlaves() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

const ua = navigator.userAgent;
export const esApple = /iPhone|iPad|Macintosh/.test(ua);
export const esAndroid = /Android/.test(ua);
// Cómo llamarle al método según el teléfono
export const nombreMetodo = esApple ? 'Face ID o Touch ID' : esAndroid ? 'tu huella' : /Windows/.test(ua) ? 'Windows Hello' : 'llave de acceso';
export const nombreDispositivo = () => (/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
  : /Android/.test(ua) ? 'Celular Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Computadora Windows' : 'Este dispositivo');

// Cancelar el diálogo del sistema no es un error para mostrar
export const cancelado = e => e?.name === 'NotAllowedError' || e?.name === 'AbortError';

export async function crearLlave({ reto, rpId, excluir = [] }) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: deB64(reto),
      rp: { name: 'Mundograf', id: rpId },
      user: { id: new TextEncoder().encode('mundograf-panel'), name: 'Panel Mundograf', displayName: 'Panel Mundograf' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      excludeCredentials: excluir.map(id => ({ type: 'public-key', id: deB64(id) })),
      attestation: 'none',
      timeout: 120000,
    },
  });
  const r = cred.response;
  const pk = r.getPublicKey?.();
  if (!pk || !r.getAuthenticatorData) throw new Error('Este navegador no permite llaves de acceso. Actualizalo y probá de nuevo.');
  return { id: b64(cred.rawId), clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.getAuthenticatorData()), publicKey: b64(pk), alg: r.getPublicKeyAlgorithm() };
}

export async function usarLlave({ reto, rpId }) {
  const cred = await navigator.credentials.get({ publicKey: { challenge: deB64(reto), rpId, userVerification: 'required', timeout: 120000 } });
  const r = cred.response;
  return { id: b64(cred.rawId), clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData), signature: b64(r.signature) };
}
