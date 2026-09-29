import { CryptoUtil } from './crypto.util';

describe('CryptoUtil', () => {
  // ─── generateApiKey ───────────────────────────────────────────────────────

  describe('generateApiKey()', () => {
    it('debe generar una llave de tipo "test" con prefijo fp_test_', () => {
      const { rawKey, keyPrefix, keyHash, maskedKey } = CryptoUtil.generateApiKey('test');

      expect(rawKey).toMatch(/^fp_test_[a-f0-9]+$/);
      expect(keyPrefix).toBe(rawKey.substring(0, 12));
      expect(keyPrefix).toMatch(/^fp_test_/);
      expect(maskedKey).toContain('...');
      expect(maskedKey.startsWith(keyPrefix)).toBe(true);
      expect(keyHash).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('debe generar una llave de tipo "live" con prefijo fp_live_', () => {
      const { rawKey, keyPrefix, keyHash, maskedKey } = CryptoUtil.generateApiKey('live');

      expect(rawKey).toMatch(/^fp_live_[a-f0-9]+$/);
      expect(keyPrefix).toBe(rawKey.substring(0, 12));
      expect(keyPrefix).toMatch(/^fp_live/);
      expect(maskedKey).toContain('...');
      expect(keyHash).toHaveLength(64);
    });

    it('debe generar llaves únicas en cada invocación', () => {
      const key1 = CryptoUtil.generateApiKey('test');
      const key2 = CryptoUtil.generateApiKey('test');

      expect(key1.rawKey).not.toBe(key2.rawKey);
      expect(key1.keyHash).not.toBe(key2.keyHash);
    });

    it('la llave enmascarada no debe contener la llave completa', () => {
      const { rawKey, maskedKey } = CryptoUtil.generateApiKey('live');
      // La versión enmascarada nunca debe igualar al valor real
      expect(maskedKey).not.toBe(rawKey);
      // Solo expone los últimos 4 caracteres de la llave real al final
      const lastFour = rawKey.substring(rawKey.length - 4);
      expect(maskedKey.endsWith(lastFour)).toBe(true);
    });

    it('el hash almacenado es un SHA-256 hexadecimal válido', () => {
      const { rawKey, keyHash } = CryptoUtil.generateApiKey('test');
      // Re-hashear debe producir el mismo resultado (determinismo)
      const rehashed = CryptoUtil.hashString(rawKey);
      expect(rehashed).toBe(keyHash);
    });
  });

  // ─── generateSecureToken ──────────────────────────────────────────────────

  describe('generateSecureToken()', () => {
    it('debe generar un token hexadecimal de 64 caracteres por defecto (32 bytes)', () => {
      const token = CryptoUtil.generateSecureToken();
      expect(token).toHaveLength(64); // 32 bytes * 2 hex chars/byte
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('debe respetar el parámetro de bytes personalizado', () => {
      const token16 = CryptoUtil.generateSecureToken(16);
      const token64 = CryptoUtil.generateSecureToken(64);

      expect(token16).toHaveLength(32);  // 16 bytes → 32 hex chars
      expect(token64).toHaveLength(128); // 64 bytes → 128 hex chars
    });

    it('debe generar tokens únicos en cada invocación', () => {
      const t1 = CryptoUtil.generateSecureToken(32);
      const t2 = CryptoUtil.generateSecureToken(32);
      expect(t1).not.toBe(t2);
    });
  });

  // ─── hashString ───────────────────────────────────────────────────────────

  describe('hashString()', () => {
    it('debe producir un hash SHA-256 hexadecimal de 64 caracteres', () => {
      const hash = CryptoUtil.hashString('fp_test_abc123');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('debe ser determinista: el mismo input produce el mismo hash', () => {
      const input = 'fp_live_deterministic_test';
      expect(CryptoUtil.hashString(input)).toBe(CryptoUtil.hashString(input));
    });

    it('inputs distintos producen hashes distintos', () => {
      const h1 = CryptoUtil.hashString('fp_test_aaaa');
      const h2 = CryptoUtil.hashString('fp_test_bbbb');
      expect(h1).not.toBe(h2);
    });
  });

  // ─── constantTimeCompare ──────────────────────────────────────────────────

  describe('constantTimeCompare()', () => {
    it('debe retornar true cuando ambas cadenas son iguales', () => {
      const hash = CryptoUtil.hashString('fp_test_xyz');
      expect(CryptoUtil.constantTimeCompare(hash, hash)).toBe(true);
    });

    it('debe retornar false cuando las cadenas difieren', () => {
      const h1 = CryptoUtil.hashString('fp_test_aaa');
      const h2 = CryptoUtil.hashString('fp_test_bbb');
      expect(CryptoUtil.constantTimeCompare(h1, h2)).toBe(false);
    });

    it('debe retornar false cuando las cadenas tienen longitud distinta', () => {
      // Buffers de distintas longitudes → false inmediato (sin timing leak)
      expect(CryptoUtil.constantTimeCompare('abc', 'abcd')).toBe(false);
    });
  });
});
