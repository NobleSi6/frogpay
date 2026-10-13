import { apiRequest } from '@/lib/api-client';
import { SPRINT1_DEMO_MODE } from '@/lib/demo-mode';

export interface CreateBankTransferInput {
  amount: number;
  currency: string;
  idempotencyKey: string;
}

export interface BankInstructions {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: string;
  currency: string;
  reference: string;
}

export type BankTransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'EXPIRED';
export type BankSimulationType = 'EXACT' | 'DIFFERENT_AMOUNT' | 'UNKNOWN_REFERENCE';

export interface BankTransferResponse {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'failed' | 'expired';
  amount: string;
  currency: string;
  paymentMethod: 'bank_transfer';
  environment: 'sandbox' | 'production';
  merchantReference: string;
  bankInstructions: BankInstructions;
  expiresAt: string;
  createdAt: string;
}

interface BankTransferApiResponse
  extends Omit<BankTransferResponse, 'status' | 'bankInstructions' | 'expiresAt'> {
  status: string;
  bankInstructions?: BankInstructions | null;
  expiresAt?: string | null;
}

const mockBankTransfers = new Map<string, BankTransferResponse>();

export function getMockBankTransfer(paymentId: string) {
  return mockBankTransfers.get(paymentId);
}

function requireMockBankTransfer(paymentId: string) {
  const payment = mockBankTransfers.get(paymentId);
  if (!payment) {
    throw new Error('No se encontró la transferencia de prueba. Genera una nueva.');
  }
  return payment;
}

function toPaymentStatus(status: BankTransferResponse['status']): BankTransferStatus {
  if (status === 'approved') return 'APPROVED';
  if (status === 'rejected') return 'REJECTED';
  if (status === 'failed') return 'FAILED';
  if (status === 'expired') return 'EXPIRED';
  return 'PENDING';
}

function normalizeStatus(status: string): BankTransferStatus {
  switch (status.toLowerCase()) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'REJECTED';
    case 'failed':
      return 'FAILED';
    case 'expired':
      return 'EXPIRED';
    case 'pending':
      return 'PENDING';
    default:
      throw new Error(`Estado de transferencia no reconocido: ${status}`);
  }
}

function normalizeCreatedStatus(status: string): BankTransferResponse['status'] {
  const normalizedStatus = status.toLowerCase();
  if (
    normalizedStatus === 'pending' ||
    normalizedStatus === 'approved' ||
    normalizedStatus === 'rejected' ||
    normalizedStatus === 'failed' ||
    normalizedStatus === 'expired'
  ) {
    return normalizedStatus;
  }
  throw new Error(`Estado de transferencia no reconocido: ${status}`);
}

export const bankTransferService = {
  createBankTransfer: async (data: CreateBankTransferInput): Promise<BankTransferResponse> => {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('El monto debe ser un número mayor a cero.');
    }

    if (!SPRINT1_DEMO_MODE) {
      const payment = await apiRequest<BankTransferApiResponse>('/dashboard/payments/test', {
        method: 'POST',
        headers: { 'Idempotency-Key': data.idempotencyKey },
        body: JSON.stringify({
          amount: data.amount.toFixed(2),
          currency: data.currency,
          paymentMethod: 'bank_transfer',
          merchantReference: `DASH-BANK-${data.idempotencyKey}`,
        }),
      });

      if (!payment.bankInstructions || !payment.expiresAt) {
        throw new Error('El proveedor no devolvió las instrucciones bancarias o su fecha de expiración.');
      }

      return {
        ...payment,
        status: normalizeCreatedStatus(payment.status),
        paymentMethod: 'bank_transfer',
        bankInstructions: payment.bankInstructions,
        expiresAt: payment.expiresAt,
      };
    }

    const amount = data.amount.toFixed(2);
    const reference = `FP-TEST-${Math.floor(100 + Math.random() * 900)}`;
    const createdAt = new Date().toISOString();
    const payment: BankTransferResponse = {
      id: `pay_bank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'pending',
      amount,
      currency: data.currency,
      paymentMethod: 'bank_transfer',
      environment: 'sandbox',
      merchantReference: `DASH-BANK-${data.idempotencyKey}`,
      bankInstructions: {
        bankName: 'Banco Sandbox',
        accountNumber: 'TEST-000123456',
        accountHolder: 'FrogPay Sandbox',
        amount: `${amount} ${data.currency}`,
        currency: data.currency,
        reference,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt,
    };
    mockBankTransfers.set(payment.id, payment);
    return payment;
  },

  getBankTransferStatus: async (paymentId: string): Promise<BankTransferStatus> => {
    if (SPRINT1_DEMO_MODE) {
      return toPaymentStatus(requireMockBankTransfer(paymentId).status);
    }

    const payment = await apiRequest<Pick<BankTransferApiResponse, 'status'>>(
      `/dashboard/payments/${encodeURIComponent(paymentId)}`,
    );
    return normalizeStatus(payment.status);
  },

  simulateBankDeposit: async (
    paymentId: string,
    simulationType: BankSimulationType,
  ): Promise<void> => {
    if (!SPRINT1_DEMO_MODE) {
      const modes: Record<BankSimulationType, 'exact' | 'amount_mismatch' | 'reference_not_found'> = {
        EXACT: 'exact',
        DIFFERENT_AMOUNT: 'amount_mismatch',
        UNKNOWN_REFERENCE: 'reference_not_found',
      };
      await apiRequest(`/dashboard/payments/${encodeURIComponent(paymentId)}/simulate-deposit`, {
        method: 'POST',
        body: JSON.stringify({ mode: modes[simulationType] }),
      });
      return;
    }

    const payment = requireMockBankTransfer(paymentId);
    if (simulationType === 'UNKNOWN_REFERENCE') return;

    mockBankTransfers.set(paymentId, {
      ...payment,
      status: simulationType === 'EXACT' ? 'approved' : 'rejected',
    });
  },

  expireMockBankTransfer: async (paymentId: string): Promise<void> => {
    if (!SPRINT1_DEMO_MODE) {
      await bankTransferService.getBankTransferStatus(paymentId);
      return;
    }

    const payment = requireMockBankTransfer(paymentId);
    mockBankTransfers.set(paymentId, { ...payment, status: 'expired' });
  },
};
