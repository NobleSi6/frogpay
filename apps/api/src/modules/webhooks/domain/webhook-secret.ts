import { randomBytes } from 'node:crypto';

/** Secreto de firma: se muestra una sola vez al crearlo o rotarlo y se guarda cifrado. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}
