import { ConfigService } from '@nestjs/config';
import { BankTransferLocalAdapter } from './bank-transfer.adapter';

describe('BankTransferLocalAdapter', () => {
  let adapter: BankTransferLocalAdapter;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, defaultValue: any) => {
        if (key === 'BANK_TRANSFER_EXPIRATION_HOURS') return 24;
        return defaultValue;
      }),
    } as unknown as ConfigService;

    adapter = new BankTransferLocalAdapter(configService);
  });

  it('debe exponer los metadatos correctos para el proveedor asíncrono', () => {
    const metadata = adapter.getMetadata();

    expect(metadata.id).toBe('bank_transfer_local');
    expect(metadata.name).toBe('Banco FrogPay Simulado');
    expect(metadata.processingMode).toBe('asynchronous');
    expect(metadata.requiresPaymentToken).toBe(false);
  });

  it('debe retornar outcome pending con instrucciones y referencia generada', async () => {
    const result = await adapter.authorize({
      amount: '150.00',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey: 'idem-test-key-1',
    });

    expect(result.outcome).toBe('pending');
    expect(result.providerTransactionId).toBeDefined();
    expect(result.providerTransactionId).toMatch(/^BT-\d{4}-[A-Z0-9]+$/);

    expect(result.bankInstructions).toBeDefined();
    expect(result.bankInstructions?.bankName).toBe('Banco FrogPay Simulado');
    expect(result.bankInstructions?.accountNumber).toBe('10000012345');
    expect(result.bankInstructions?.amount).toBe('150.00');
    expect(result.bankInstructions?.currency).toBe('BOB');
    expect(result.bankInstructions?.reference).toBe(result.providerTransactionId);

    expect(result.expiresAt).toBeInstanceOf(Date);
    // Verificar que expire aproximadamente en 24 horas
    const now = Date.now();
    const expiryTime = result.expiresAt!.getTime();
    const diffHours = (expiryTime - now) / (1000 * 60 * 60);
    expect(diffHours).toBeGreaterThanOrEqual(23.9);
    expect(diffHours).toBeLessThanOrEqual(24.1);
  });

  it('debe generar referencias únicas en cada autorización', async () => {
    const res1 = await adapter.authorize({
      amount: '50.00',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey: 'idem-1',
    });
    const res2 = await adapter.authorize({
      amount: '50.00',
      currency: 'BOB',
      paymentToken: '',
      idempotencyKey: 'idem-2',
    });

    expect(res1.providerTransactionId).not.toBe(res2.providerTransactionId);
    expect(res1.bankInstructions?.reference).not.toBe(res2.bankInstructions?.reference);
  });
});
