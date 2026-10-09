import { ERROR_CATALOG } from '../../../shared/http/errors/error-catalog';
import { PaymentProviderErrorCode } from './payment-provider.port';

const PROVIDER_ERROR_CODES: Record<PaymentProviderErrorCode, true> = {
  card_declined: true,
  insufficient_funds: true,
  expired_card: true,
  incorrect_cvc: true,
  processing_error: true,
  provider_timeout: true,
  provider_unavailable: true,
};

describe('PaymentProviderErrorCode', () => {
  it('matches the seven payment-result codes in ERROR_CATALOG', () => {
    const catalogResultCodes = Object.entries(ERROR_CATALOG)
      .filter(([, entry]) => !('httpStatus' in entry))
      .map(([code]) => code)
      .sort();

    expect(Object.keys(PROVIDER_ERROR_CODES).sort()).toEqual(catalogResultCodes);
  });
});
