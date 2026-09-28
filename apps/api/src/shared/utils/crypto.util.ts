import * as crypto from 'crypto';

export interface GeneratedApiKey {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
  maskedKey: string;
}

export class CryptoUtil {
  /**
   * Genera una API Key con prefijo según el entorno (fp_test_... o fp_live_...)
   * y calcula su hash SHA-256 para almacenamiento seguro.
   */
  public static generateApiKey(type: 'test' | 'live'): GeneratedApiKey {
    const randomBytes = crypto.randomBytes(24).toString('hex');
    const rawKey = `fp_${type}_${randomBytes}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = this.hashString(rawKey);
    const maskedKey = `${keyPrefix}...${rawKey.substring(rawKey.length - 4)}`;

    return {
      rawKey,
      keyPrefix,
      keyHash,
      maskedKey,
    };
  }

  /**
   * Genera un token criptográficamente seguro para invitaciones o activación de cuentas.
   */
  public static generateSecureToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Genera un hash SHA-256 de una cadena de texto.
   */
  public static hashString(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Compara en tiempo constante para mitigar ataques de temporización (timing attacks).
   */
  public static constantTimeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
