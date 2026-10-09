import { ConfigService } from '@nestjs/config';
import { CredentialsEncryptionService } from './credentials-encryption.service';

describe('CredentialsEncryptionService', () => {
  const key = 'a'.repeat(64);

  it('encrypts credentials with authenticated encryption and decrypts them', () => {
    const service = new CredentialsEncryptionService({
      get: jest.fn().mockReturnValue(key),
    } as unknown as ConfigService);
    const plaintext = JSON.stringify({ secretKey: 'sk_test_do-not-return-this' });

    const encrypted = service.encrypt(plaintext);

    expect(encrypted).not.toContain('sk_test_do-not-return-this');
    expect(encrypted.split(':')).toHaveLength(4);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('rejects ciphertext encrypted with a different key', () => {
    const firstKey = new CredentialsEncryptionService({
      get: jest.fn().mockReturnValue(key),
    } as unknown as ConfigService);
    const secondKey = new CredentialsEncryptionService({
      get: jest.fn().mockReturnValue('b'.repeat(64)),
    } as unknown as ConfigService);

    expect(() => secondKey.decrypt(firstKey.encrypt('credential'))).toThrow(
      'No se pudieron descifrar las credenciales del proveedor.',
    );
  });
});