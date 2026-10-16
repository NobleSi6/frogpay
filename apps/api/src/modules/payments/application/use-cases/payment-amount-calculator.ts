export interface PaymentAmounts {
  commissionAmount: string;
  netAmount: string;
}

export function calculatePaymentAmounts(
  amount: number,
  commissionFixed: number,
  commissionPct: number,
): PaymentAmounts {
  const commission = Number((amount * commissionPct + commissionFixed).toFixed(2));
  const net = Number((amount - commission).toFixed(2));
  return {
    commissionAmount: commission.toFixed(2),
    netAmount: net.toFixed(2),
  };
}
