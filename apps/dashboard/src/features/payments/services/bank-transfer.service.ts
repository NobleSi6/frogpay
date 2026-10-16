import { apiRequest } from "@/lib/api-client";
import { paymentsService } from "./payments.service";

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

export type BankTransferStatus = "PENDING" | "APPROVED" | "REJECTED" | "FAILED" | "EXPIRED";
export type BankSimulationType = "EXACT" | "DIFFERENT_AMOUNT" | "UNKNOWN_REFERENCE";

export interface BankTransferResponse {
  id: string;
  status: "pending" | "approved" | "rejected" | "failed" | "expired";
  amount: string;
  currency: string;
  paymentMethod: "bank_transfer";
  environment: "sandbox" | "production";
  merchantReference: string;
  bankInstructions: BankInstructions;
  expiresAt: string;
  createdAt: string;
}

interface CreatedBankTransferResponse extends Omit<BankTransferResponse, "bankInstructions" | "expiresAt"> {
  bankInstructions?: BankInstructions | null;
  expiresAt?: string | null;
}

export interface BankDepositSimulationResponse {
  status: "reconciled" | "amount_mismatch" | "currency_mismatch" | "unmatched";
  depositId: string;
  paymentId?: string;
  errorCode?: string;
}

export const bankTransferService = {
  createBankTransfer: async (data: CreateBankTransferInput): Promise<BankTransferResponse> => {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error("El monto debe ser un número mayor a cero.");
    }

    const payment = await apiRequest<CreatedBankTransferResponse>("/dashboard/payments/test", {
      method: "POST",
      headers: { "Idempotency-Key": data.idempotencyKey },
      body: JSON.stringify({
        amount: data.amount.toFixed(2),
        currency: data.currency,
        paymentMethod: "bank_transfer",
        merchantReference: `DASH-BANK-${data.idempotencyKey}`,
      }),
    });

    if (payment.paymentMethod !== "bank_transfer" || !payment.bankInstructions || !payment.expiresAt) {
      throw new Error("El backend no devolvió las instrucciones o la expiración de la transferencia.");
    }

    return {
      ...payment,
      bankInstructions: payment.bankInstructions,
      expiresAt: payment.expiresAt,
    };
  },

  getBankTransferStatus: async (paymentId: string): Promise<BankTransferStatus> => {
    const payment = await paymentsService.getPaymentById(paymentId);
    return payment.status;
  },

  simulateBankDeposit: async (
    paymentId: string,
    simulationType: BankSimulationType,
  ): Promise<BankDepositSimulationResponse> => {
    const mode = {
      EXACT: "exact",
      DIFFERENT_AMOUNT: "amount_mismatch",
      UNKNOWN_REFERENCE: "reference_not_found",
    } as const;

    return apiRequest<BankDepositSimulationResponse>(
      `/dashboard/payments/${encodeURIComponent(paymentId)}/simulate-deposit`,
      {
        method: "POST",
        body: JSON.stringify({ mode: mode[simulationType] }),
      },
    );
  },
};
