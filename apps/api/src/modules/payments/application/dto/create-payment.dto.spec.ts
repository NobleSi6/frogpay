import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto';

const validPaymentFields = {
  amount: '25.00',
  currency: 'BOB',
  merchantReference: 'test-order',
};

describe('CreatePaymentDto', () => {
  it('normalizes a non-card method and accepts it without a token', () => {
    const dto = plainToInstance(CreatePaymentDto, {
      ...validPaymentFields,
      paymentMethod: '  MoCk  ',
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.paymentMethod).toBe('mock');
    expect(dto.paymentToken).toBeUndefined();
  });

  it('continues to validate Stripe token format when a token is provided', () => {
    const dto = plainToInstance(CreatePaymentDto, {
      ...validPaymentFields,
      paymentMethod: 'card',
      paymentToken: 'invalid-token',
    });

    expect(validateSync(dto)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'paymentToken',
        }),
      ]),
    );
    expect(dto.paymentMethod).toBe('card');
  });
});
