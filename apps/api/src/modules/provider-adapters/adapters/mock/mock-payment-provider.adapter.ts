import { Injectable } from '@nestjs/common';
import type {
  AuthorizeInput,
  CaptureInput,
  PaymentProviderPort,
  ProviderMetadata,
  ProviderResult,
  QueryStatusInput,
} from '../../ports/payment-provider.port';

@Injectable()
export class MockPaymentProviderAdapter implements PaymentProviderPort {
  readonly metadata: ProviderMetadata = {
    id: 'mock',
    displayName: 'Mock',
    methods: [
      {
        code: 'card',
        label: 'Tarjeta (simulada)',
        processingMode: 'synchronous',
        requiresPaymentToken: false,
        fees: { fixedAmount: '0.00', variableBps: 0, currency: 'BOB' },
      },
    ],
  };

  async authorize(input: AuthorizeInput): Promise<ProviderResult> {
    return {
      outcome: 'approved',
      providerTransactionId: `mock_${input.idempotencyKey}`,
    };
  }

  async capture(input: CaptureInput): Promise<ProviderResult> {
    return { outcome: 'approved', providerTransactionId: input.providerTransactionId };
  }

  async queryStatus(input: QueryStatusInput): Promise<ProviderResult> {
    return { outcome: 'approved', providerTransactionId: input.providerTransactionId };
  }
}
