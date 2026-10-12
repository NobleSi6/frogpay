import { apiRequest } from "@/lib/api-client";

export type ReconciliationStatus = 'CONCILIATED' | 'WITHOUT_REFERENCE' | 'AMOUNT_MISMATCH';

export interface BankTransaction {
  id: string;
  reference: string;
  createdAt: string;
  bankName: string;
  amount: number;
  currency: string;
  status: ReconciliationStatus;
  paymentId?: string;
}

export const reconciliationService = {
  getBankTransactions: async (): Promise<BankTransaction[]> => {
    try {
      return await apiRequest<BankTransaction[]>('/dashboard/bank-transactions');
    } catch (error) {
      console.warn('[Backend no disponible] Usando Mock de Conciliación Bancaria:', error);
      
      // MOCK TEMPORAL alineado al mockup
      return [
        {
          id: 'bt_1',
          reference: 'TRX-28991',
          createdAt: '24 Sep, 10:42',
          bankName: 'Simulado',
          amount: 1240.00,
          currency: 'BOB',
          status: 'CONCILIATED',
          paymentId: 'pay_conciliated_101',
        },
        {
          id: 'bt_2',
          reference: 'TRX-289901',
          createdAt: '23 Sep, 16:08',
          bankName: 'Simulado',
          amount: 8500.00,
          currency: 'BOB',
          status: 'WITHOUT_REFERENCE',
        },
        {
          id: 'bt_3',
          reference: 'TRX-39809',
          createdAt: '22 Sep, 09:15',
          bankName: 'Simulado',
          amount: 349.00,
          currency: 'BOB',
          status: 'AMOUNT_MISMATCH',
        },
      ];
    }
  },
};