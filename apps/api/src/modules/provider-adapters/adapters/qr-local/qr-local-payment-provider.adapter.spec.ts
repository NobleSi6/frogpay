import {
  calculateCrc16CcittFalse,
  createQrPayload,
  parseQrExpirationMinutes,
  QRLocalPaymentProviderAdapter,
} from './qr-local-payment-provider.adapter';

function parseTlv(payload: string): Map<string, string> {
  const fields = new Map<string, string>();
  let offset = 0;
  while (offset < payload.length) {
    const tag = payload.slice(offset, offset + 2);
    const length = Number(payload.slice(offset + 2, offset + 4));
    const start = offset + 4;
    fields.set(tag, payload.slice(start, start + length));
    offset = start + length;
  }
  return fields;
}

describe('QRLocalPaymentProviderAdapter', () => {
  const adapter = new QRLocalPaymentProviderAdapter();

  afterEach(() => {
    delete process.env.QR_EXPIRATION_MINUTES;
    jest.useRealTimers();
  });

  it('declares asynchronous QR capability and MVP reference fees', () => {
    expect(adapter.metadata).toMatchObject({
      id: 'qr_local',
      methods: [
        {
          code: 'qr',
          label: 'Billetera QR',
          processingMode: 'asynchronous',
          requiresPaymentToken: false,
          fees: { fixedAmount: '0.00', variableBps: 100, currency: 'BOB' },
        },
      ],
    });
  });

  it('calculates CRC16-CCITT-FALSE using the standard check vector', () => {
    expect(calculateCrc16CcittFalse('123456789')).toBe('29B1');
  });

  it('builds a dynamic EMVCo payload with BOB amount and valid CRC', async () => {
    const result = await adapter.authorize({
      amount: '12.5',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey: 'idem-1',
    });
    const payload = result.qrPayload!;
    const withoutCrc = payload.slice(0, -4);
    const fields = parseTlv(withoutCrc);

    expect(result.outcome).toBe('pending');
    expect(result.providerTransactionId).toMatch(/^FP[A-F0-9]{16}$/);
    expect(fields.get('00')).toBe('01');
    expect(fields.get('01')).toBe('12');
    expect(fields.get('52')).toBe('0000');
    expect(fields.get('53')).toBe('068');
    expect(fields.get('54')).toBe('12.50');
    expect(fields.get('58')).toBe('BO');
    expect(fields.get('59')).toBe('FrogPay Demo');
    expect(fields.get('60')).toBe('La Paz');
    expect(fields.get('26')).toContain(`01${result.providerTransactionId!.length}${result.providerTransactionId}`);
    expect(fields.get('62')).toBe(`05${result.providerTransactionId!.length}${result.providerTransactionId}`);
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(payload.slice(-4)).toBe(calculateCrc16CcittFalse(payload.slice(0, -4)));
  });

  it('uses the configured expiration and defaults to fifteen minutes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-10T12:00:00.000Z'));
    process.env.QR_EXPIRATION_MINUTES = '7';
    const configured = await adapter.authorize({
      amount: '1.00',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey: 'idem-2',
    });
    expect(configured.expiresAt).toEqual(new Date('2026-10-10T12:07:00.000Z'));

    delete process.env.QR_EXPIRATION_MINUTES;
    const defaulted = await adapter.authorize({
      amount: '1.00',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey: 'idem-3',
    });
    expect(defaulted.expiresAt).toEqual(new Date('2026-10-10T12:15:00.000Z'));
  });

  it('rejects invalid expiration configuration, amounts, and currencies explicitly', () => {
    for (const invalid of ['', '0', '-2', '1.5', '15minutes']) {
      expect(() => parseQrExpirationMinutes(invalid)).toThrow('QR_EXPIRATION_MINUTES');
    }
    expect(() => createQrPayload('0.00', 'BOB', 'FP0000000000000000')).toThrow('monto QR');
    expect(() => createQrPayload('10.00', 'USD', 'FP0000000000000000')).toThrow('moneda BOB');
  });

  it('generates a unique reference across one thousand authorizations', async () => {
    const references = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const result = await adapter.authorize({
        amount: '1.00',
        currency: 'BOB',
        paymentToken: '',
        idempotencyKey: `idem-${index}`,
      });
      references.add(result.providerTransactionId!);
    }
    expect(references.size).toBe(1000);
  });

  it('keeps capture and status pending with the same transaction reference', async () => {
    await expect(adapter.capture({ providerTransactionId: 'FP0000000000000000' })).resolves.toEqual({
      outcome: 'pending',
      providerTransactionId: 'FP0000000000000000',
    });
    await expect(
      adapter.queryStatus({ providerTransactionId: 'FP0000000000000000' }),
    ).resolves.toEqual({
      outcome: 'pending',
      providerTransactionId: 'FP0000000000000000',
    });
  });
});
