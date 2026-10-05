import { InvalidStripeAmountError, isZeroDecimalCurrency, toStripeAmount } from './stripe-amount';

describe('toStripeAmount', () => {
  it('convierte un decimal de dos posiciones a unidades menores', () => {
    expect(toStripeAmount('150.00', 'BOB')).toBe(15000);
    expect(toStripeAmount('150', 'BOB')).toBe(15000);
    expect(toStripeAmount('150.5', 'BOB')).toBe(15050);
    expect(toStripeAmount('0.01', 'BOB')).toBe(1);
  });

  it('no arrastra error de coma flotante', () => {
    // 1.15 * 100 === 114.99999999999999 en IEEE-754.
    expect(toStripeAmount('1.15', 'USD')).toBe(115);
    expect(toStripeAmount('8.29', 'BOB')).toBe(829);
    expect(toStripeAmount('1234.56', 'BOB')).toBe(123456);
  });

  it('acepta coma como separador decimal', () => {
    expect(toStripeAmount('10,50', 'BOB')).toBe(1050);
  });

  it('normaliza mayúsculas y espacios en la moneda', () => {
    expect(toStripeAmount('10.00', ' bob ')).toBe(1000);
  });

  it('no multiplica por 100 en monedas sin decimales', () => {
    expect(isZeroDecimalCurrency('JPY')).toBe(true);
    expect(toStripeAmount('500', 'JPY')).toBe(500);
    expect(toStripeAmount('500.00', 'JPY')).toBe(500);
  });

  it('rechaza decimales en monedas sin decimales', () => {
    expect(() => toStripeAmount('500.50', 'JPY')).toThrow(InvalidStripeAmountError);
  });

  it('rechaza montos no positivos, mal formados o con más de dos decimales', () => {
    expect(() => toStripeAmount('0', 'BOB')).toThrow(InvalidStripeAmountError);
    expect(() => toStripeAmount('0.00', 'BOB')).toThrow(InvalidStripeAmountError);
    expect(() => toStripeAmount('-5.00', 'BOB')).toThrow(InvalidStripeAmountError);
    expect(() => toStripeAmount('10.999', 'BOB')).toThrow(InvalidStripeAmountError);
    expect(() => toStripeAmount('abc', 'BOB')).toThrow(InvalidStripeAmountError);
    expect(() => toStripeAmount('', 'BOB')).toThrow(InvalidStripeAmountError);
  });

  it('rechaza monedas que no son ISO 4217 de tres letras', () => {
    expect(() => toStripeAmount('10.00', 'BO')).toThrow(InvalidStripeAmountError);
    expect(() => toStripeAmount('10.00', 'BOB4')).toThrow(InvalidStripeAmountError);
  });
});