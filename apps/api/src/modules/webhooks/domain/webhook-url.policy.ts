import { isIP } from 'node:net';

export type WebhookEnvironment = 'sandbox' | 'production';
const MAX_URL_LENGTH = 2048;

/**
 * Reglas de la URL de un endpoint (TSK-DEV2-303):
 * - producción: solo https:// y nunca hacia direcciones internas (protección SSRF);
 * - sandbox: se permite http:// para receptores locales de prueba.
 * Devuelve el motivo del rechazo o null si la URL es válida.
 */
export function validateWebhookUrl(raw: string, environment: WebhookEnvironment): string | null {
  if (!raw || raw.length > MAX_URL_LENGTH) return 'La URL es obligatoria y debe tener como máximo 2048 caracteres.';

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'La URL no tiene un formato válido.';
  }

  if (url.username || url.password) return 'La URL no puede incluir usuario ni contraseña.';
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'La URL debe usar http o https.';
  if (environment === 'production' && url.protocol !== 'https:') {
    return 'En producción la URL del webhook debe usar HTTPS.';
  }
  if (environment === 'production' && isInternalHost(url.hostname)) {
    return 'En producción la URL no puede apuntar a una dirección interna o local.';
  }
  return null;
}

function isInternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (version === 6) {
    return host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  }
  return !host.includes('.');
}
