import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  AuthorizeInput,
  BankTransferInstructions,
  CaptureInput,
  PaymentProviderPort,
  ProviderMetadata,
  ProviderResult,
  QueryStatusInput,
} from '../../ports/payment-provider.port';

export const BANK_TRANSFER_ADAPTER_CODE = 'bank_transfer_local';

@Injectable()
export class BankTransferLocalAdapter implements PaymentProviderPort {
  private readonly logger = new Logger(BankTransferLocalAdapter.name);
  private readonly expirationHours: number;

  readonly metadata: ProviderMetadata = {
    id: BANK_TRANSFER_ADAPTER_CODE,
    displayName: 'Banco FrogPay Simulado',
    methods: [
      {
        code: 'bank_transfer',
        label: 'Transferencia Bancaria',
        processingMode: 'asynchronous',
        requiresPaymentToken: false,
        fees: {
          fixedAmount: '1.00',
          variableBps: 100, // 1%
          currency: 'BOB',
        },
      },
    ],
  };

  constructor(private readonly config: ConfigService) {
    const hours = parseInt(this.config.get<string>('BANK_TRANSFER_EXPIRATION_HOURS') ?? '24', 10);
    this.expirationHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  }

  async authorize(input: AuthorizeInput): Promise<ProviderResult> {
    const reference = this.generateReference();
    const expiresAt = new Date(Date.now() + this.expirationHours * 3600 * 1000);

    const bankInstructions: BankTransferInstructions = {
      bankName: 'Banco FrogPay Simulado',
      accountNumber: '10000012345',
      accountHolder: 'FrogPay Bolivia S.R.L.',
      amount: input.amount,
      currency: input.currency,
      reference,
    };

    this.logger.log(
      `Generadas instrucciones de transferencia bancaria. Referencia: ${reference}, Vencimiento: ${expiresAt.toISOString()}`,
    );

    return {
      outcome: 'pending',
      providerTransactionId: reference,
      expiresAt,
      bankInstructions,
    };
  }

  async capture(input: CaptureInput): Promise<ProviderResult> {
    return {
      outcome: 'approved',
      providerTransactionId: input.providerTransactionId,
    };
  }

  async queryStatus(input: QueryStatusInput): Promise<ProviderResult> {
    return {
      outcome: 'pending',
      providerTransactionId: input.providerTransactionId,
    };
  }

  generateReference(): string {
    const year = new Date().getFullYear();
    const hex = randomBytes(3).toString('hex').toUpperCase();
    return `BT-${year}-${hex}`;
  }
}
