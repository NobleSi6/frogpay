import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Firma de webhooks salientes (TSK-DEV2-301, ADR-006).
 *
 * Cabecera: FrogPay-Signature: t=<unix_segundos>,v1=<hex(HMAC-SHA256(secreto, "<t>.<cuerpo>"))>
 * El timestamp forma parte del mensaje firmado para impedir ataques de repetición.
 */
export const SIGNATURE_HEADER = 'FrogPay-Signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

export function buildSignatureHeader(secret: string, timestamp: number, rawBody: string): string {
  return `t=${timestamp},v1=${computeSignature(secret, timestamp, rawBody)}`;
}

export interface VerifySignatureInput {
  secret: string;
  header: string | undefined;
  rawBody: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}

/**
 * Verificación de referencia: es el mismo algoritmo que se documenta para los
 * comercios en docs/api/webhooks.md.
 */
export function verifySignature(input: VerifySignatureInput): boolean {
  if (!input.header) return false;
  const parts = Object.fromEntries(
    input.header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
  const timestamp = Number(parts.t);
  const received = parts.v1;
  if (!Number.isInteger(timestamp) || !received) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = computeSignature(input.secret, timestamp, input.rawBody);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
