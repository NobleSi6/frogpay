import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  AuthorizeInput,
  CaptureInput,
  PaymentProviderPort,
  ProviderMetadata,
  ProviderResult,
  QueryStatusInput,
} from '../../ports/payment-provider.port';

const QR_ACCOUNT_GUI = 'bo.frogpay.qr';
const MERCHANT_NAME = 'FrogPay Demo';
const MERCHANT_CITY = 'La Paz';
const DEFAULT_QR_EXPIRATION_MINUTES = 15;

@Injectable()
export class QRLocalPaymentProviderAdapter implements PaymentProviderPort {
  readonly metadata: ProviderMetadata = {
    id: 'qr_local',
    displayName: 'QR Local',
    methods: [
      {
        code: 'qr',
        label: 'Billetera QR',
        processingMode: 'asynchronous',
        requiresPaymentToken: false,
        // Valores de referencia del MVP; no representan tarifas comerciales definitivas.
        fees: { fixedAmount: '0.00', variableBps: 100, currency: 'BOB' },
      },
    ],
  };

  async authorize(input: AuthorizeInput): Promise<ProviderResult> {
    const reference = `FP${randomBytes(8).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(
      Date.now() + parseQrExpirationMinutes(process.env.QR_EXPIRATION_MINUTES) * 60_000,
    );
    const qrPayload = createQrPayload(input.amount, input.currency, reference);

    return {
      outcome: 'pending',
      providerTransactionId: reference,
      qrPayload,
      expiresAt,
    };
  }

  // El QR simulado usa la BD de FrogPay como fuente de verdad; no hay confirmación externa.
  async capture(input: CaptureInput): Promise<ProviderResult> {
    return { outcome: 'pending', providerTransactionId: input.providerTransactionId };
  }

  async queryStatus(input: QueryStatusInput): Promise<ProviderResult> {
    return { outcome: 'pending', providerTransactionId: input.providerTransactionId };
  }
}

export function parseQrExpirationMinutes(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_QR_EXPIRATION_MINUTES;
  if (!/^\d+$/.test(raw)) {
    throw new Error('QR_EXPIRATION_MINUTES debe ser un entero positivo.');
  }

  const minutes = Number(raw);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new Error('QR_EXPIRATION_MINUTES debe ser un entero positivo.');
  }
  return minutes;
}

export function createQrPayload(amount: string, currency: string, reference: string): string {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error('El monto QR debe ser un decimal positivo con hasta dos decimales.');
  }
  if (currency.trim().toUpperCase() !== 'BOB') {
    throw new Error('QRLocalPaymentProviderAdapter solo admite moneda BOB.');
  }

  const normalizedAmount = Number(amount).toFixed(2);
  const merchantAccount = tlv('00', QR_ACCOUNT_GUI) + tlv('01', reference);
  const additionalData = tlv('05', reference);
  const payload =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '068') +
    tlv('54', normalizedAmount) +
    tlv('58', 'BO') +
    tlv('59', MERCHANT_NAME) +
    tlv('60', MERCHANT_CITY) +
    tlv('62', additionalData) +
    '6304';

  return `${payload}${calculateCrc16CcittFalse(payload)}`;
}

export function calculateCrc16CcittFalse(value: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, 'ascii')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, value: string): string {
  const length = Buffer.byteLength(value, 'ascii');
  if (length > 99) throw new Error(`El campo EMVCo ${tag} excede 99 bytes.`);
  return `${tag}${String(length).padStart(2, '0')}${value}`;
}
