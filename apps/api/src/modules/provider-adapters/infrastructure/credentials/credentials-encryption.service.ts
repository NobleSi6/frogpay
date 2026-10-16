import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class CredentialsEncryptionService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(encrypted: string): string {
    try {
      const [version, encodedIv, encodedTag, encodedCiphertext, extra] = encrypted.split(':');
      if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
        throw new Error('Formato de credencial inválido');
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getKey(),
        Buffer.from(encodedIv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException(
        'No se pudieron descifrar las credenciales del proveedor.',
      );
    }
  }

  private getKey(): Buffer {
    const value = this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY');
    if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
      throw new ServiceUnavailableException(
        'CREDENTIALS_ENCRYPTION_KEY debe configurarse como 64 caracteres hexadecimales.',
      );
    }
    return Buffer.from(value, 'hex');
  }
}