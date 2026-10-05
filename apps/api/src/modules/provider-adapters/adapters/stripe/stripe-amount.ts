/**
 * Conversión de monto decimal a la unidad menor que espera la API de Stripe.
 *
 * Vive dentro del adaptador y no en `shared/` a propósito: qué monedas no tienen
 * decimales es un conocimiento del proveedor. Si `payments` necesitara normalizar
 * montos por su cuenta, ahí sí correspondía un helper en `shared/utils/`.
 */

/** Monedas de Stripe sin subdivisión decimal. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

const AMOUNT_PATTERN = /^(\d+)(?:[.,](\d{1,2}))?$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

export class InvalidStripeAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidStripeAmountError.name;
  }
}

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.trim().toLowerCase());
}

/**
 * Convierte `"150.00"` + `"BOB"` a `15000`. Usa aritmética de enteros sobre
 * cadenas: un `parseFloat` seguido de `* 100` introduce errores de coma flotante
 * en el monto que se cobra.
 */
export function toStripeAmount(amount: string, currency: string): number {
  const normalizedCurrency = currency.trim().toLowerCase();
  if (!CURRENCY_PATTERN.test(currency.trim())) {
    throw new InvalidStripeAmountError(
      `La moneda "${currency}" no es un código ISO 4217 de tres letras.`,
    );
  }

  const match = AMOUNT_PATTERN.exec(amount.trim());
  if (!match) {
    throw new InvalidStripeAmountError(
      `El monto "${amount}" no es un decimal positivo con hasta dos decimales.`,
    );
  }

  const [, whole, fraction = ''] = match;
  const zeroDecimal = isZeroDecimalCurrency(normalizedCurrency);

  if (zeroDecimal && fraction && /[1-9]/.test(fraction)) {
    throw new InvalidStripeAmountError(
      `La moneda ${normalizedCurrency.toUpperCase()} no admite decimales y el monto "${amount}" los tiene.`,
    );
  }

  const minorUnits = BigInt(whole) * (zeroDecimal ? 1n : 100n) + (zeroDecimal ? 0n : BigInt(fraction.padEnd(2, '0')));

  if (minorUnits <= 0n) {
    throw new InvalidStripeAmountError(`El monto "${amount}" debe ser mayor que cero.`);
  }
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidStripeAmountError(`El monto "${amount}" excede el límite permitido por Stripe.`);
  }

  return Number(minorUnits);
}