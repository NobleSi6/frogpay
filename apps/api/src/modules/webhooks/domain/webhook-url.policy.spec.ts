import { generateWebhookSecret } from './webhook-secret';
import { validateWebhookUrl } from './webhook-url.policy';

describe('Política de URL de webhooks', () => {
  it('en producción exige HTTPS', () => {
    expect(validateWebhookUrl('http://comercio.com/hook', 'production')).toMatch(/HTTPS/);
    expect(validateWebhookUrl('https://comercio.com/hook', 'production')).toBeNull();
  });

  it('en sandbox permite http para receptores locales', () => {
    expect(validateWebhookUrl('http://localhost:4010/webhooks', 'sandbox')).toBeNull();
    expect(validateWebhookUrl('http://receptor:4010/webhooks', 'sandbox')).toBeNull();
  });

  it('en producción bloquea direcciones internas (SSRF)', () => {
    for (const url of [
      'https://localhost/hook',
      'https://127.0.0.1/hook',
      'https://10.0.0.5/hook',
      'https://192.168.1.10/hook',
      'https://172.20.0.3/hook',
      'https://169.254.169.254/latest',
      'https://rabbitmq/hook',
      'https://[::1]/hook',
    ]) {
      expect(validateWebhookUrl(url, 'production')).toMatch(/interna/);
    }
  });

  it('rechaza formatos inválidos, otros protocolos y credenciales en la URL', () => {
    expect(validateWebhookUrl('no-es-url', 'sandbox')).toMatch(/formato/);
    expect(validateWebhookUrl('ftp://comercio.com', 'sandbox')).toMatch(/http o https/);
    expect(validateWebhookUrl('https://user:pass@comercio.com', 'sandbox')).toMatch(/usuario/);
  });

  it('genera secretos únicos con prefijo whsec_', () => {
    const a = generateWebhookSecret();
    expect(a).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(generateWebhookSecret()).not.toBe(a);
  });
});
