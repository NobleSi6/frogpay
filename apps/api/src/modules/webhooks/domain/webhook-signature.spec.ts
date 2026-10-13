import { buildSignatureHeader, computeSignature, verifySignature } from './webhook-signature';

describe('Firma HMAC de webhooks', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ eventName: 'pago.aprobado', payload: { paymentId: 'p-1' } });
  const t = 1_800_000_000;

  it('genera la cabecera con timestamp y firma hex de 64 caracteres', () => {
    const header = buildSignatureHeader(secret, t, body);
    expect(header).toMatch(/^t=1800000000,v1=[a-f0-9]{64}$/);
    expect(header).toContain(computeSignature(secret, t, body));
  });

  it('la verificación acepta el cuerpo original', () => {
    const header = buildSignatureHeader(secret, t, body);
    expect(verifySignature({ secret, header, rawBody: body, nowSeconds: t })).toBe(true);
  });

  it('la verificación falla si se altera el cuerpo', () => {
    const header = buildSignatureHeader(secret, t, body);
    const tampered = body.replace('p-1', 'p-2');
    expect(verifySignature({ secret, header, rawBody: tampered, nowSeconds: t })).toBe(false);
  });

  it('la verificación falla con otro secreto', () => {
    const header = buildSignatureHeader(secret, t, body);
    expect(verifySignature({ secret: 'otro', header, rawBody: body, nowSeconds: t })).toBe(false);
  });

  it('rechaza firmas fuera de la tolerancia de tiempo (replay)', () => {
    const header = buildSignatureHeader(secret, t, body);
    expect(verifySignature({ secret, header, rawBody: body, nowSeconds: t + 301 })).toBe(false);
  });

  it('rechaza cabeceras ausentes o mal formadas', () => {
    expect(verifySignature({ secret, header: undefined, rawBody: body })).toBe(false);
    expect(verifySignature({ secret, header: 'basura', rawBody: body, nowSeconds: t })).toBe(false);
  });
});
