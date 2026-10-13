export const WEBHOOK_SECRET_CIPHER = Symbol('WEBHOOK_SECRET_CIPHER');

export interface WebhookSecretCipher {
  encrypt(secret: string): string;
  decrypt(value: string): string;
}
