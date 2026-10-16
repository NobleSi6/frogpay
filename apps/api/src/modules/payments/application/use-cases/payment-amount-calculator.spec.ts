import { calculatePaymentAmounts } from './payment-amount-calculator';

describe('calculatePaymentAmounts', () => {
  it('preserves the plan fee calculation used by card payments', () => {
    expect(calculatePaymentAmounts(100, 0.5, 0.035)).toEqual({
      commissionAmount: '4.00',
      netAmount: '96.00',
    });
  });

  it('returns zero commission when the plan has no configured fee', () => {
    expect(calculatePaymentAmounts(12.34, 0, 0)).toEqual({
      commissionAmount: '0.00',
      netAmount: '12.34',
    });
  });
});
