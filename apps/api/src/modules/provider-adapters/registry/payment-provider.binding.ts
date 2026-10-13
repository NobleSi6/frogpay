import { PaymentProviderPort } from '../ports/payment-provider.port';

/**
 * Código con el que un adaptador se identifica ante el registry. Solo se usa
 * para enlazar configuración; nunca debe salir del módulo.
 */
export type PaymentProviderCode = string;

/** Código de método de pago del catálogo (`card`, `wallet`, `qr`). */
export type PaymentMethodCode = string;

/**
 * Un adaptador disponible, con el código bajo el que se registra. El código vive
 * aquí y no en `PaymentProviderPort` para que el puerto siga siendo la
 * interfaz mínima que `payments` conoce.
 */
export interface PaymentProviderRegistration {
  adapterCode: PaymentProviderCode;
  adapter: PaymentProviderPort;
}

export interface PaymentProviderBinding {
  paymentMethod: PaymentMethodCode;
  adapterCode: PaymentProviderCode;
}

export function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

export class UnsupportedPaymentMethodError extends Error {
  constructor(
    readonly paymentMethod: string,
    readonly supportedPaymentMethods: readonly string[],
  ) {
    super(
      `No hay un adaptador de proveedor registrado para el método de pago "${paymentMethod}". Métodos soportados: ${
        supportedPaymentMethods.length > 0 ? supportedPaymentMethods.join(', ') : 'ninguno'
      }.`,
    );
    this.name = UnsupportedPaymentMethodError.name;
  }
}

export class DuplicatePaymentProviderBindingError extends Error {
  constructor(readonly paymentMethod: string, readonly adapterCodes: readonly string[]) {
    super(
      `El método de pago "${paymentMethod}" tiene más de un adaptador registrado: ${adapterCodes.join(', ')}.`,
    );
    this.name = DuplicatePaymentProviderBindingError.name;
  }
}

export class MissingPaymentProviderBindingError extends Error {
  constructor(readonly adapterCode: string, readonly paymentMethod: string) {
    super(`La configuración declara el adaptador "${adapterCode}" para "${paymentMethod}", pero no está registrado.`);
    this.name = MissingPaymentProviderBindingError.name;
  }
}

export class UnsupportedPaymentProviderBindingError extends Error {
  constructor(readonly adapterCode: string, readonly paymentMethod: string) {
    super(`El adaptador "${adapterCode}" no declara soporte para el método "${paymentMethod}".`);
    this.name = UnsupportedPaymentProviderBindingError.name;
  }
}

export class InvalidPaymentProviderBindingsError extends Error {
  constructor(readonly raw: string, reason: string) {
    super(`PAYMENT_PROVIDER_BINDINGS inválido ("${raw}"): ${reason}`);
    this.name = InvalidPaymentProviderBindingsError.name;
  }
}

/**
 * Binding por defecto de este sprint. Es una tabla de datos, no una cadena de
 * `if`: agregar un proveedor es agregar una fila.
 */
export const DEFAULT_PAYMENT_PROVIDER_BINDINGS: readonly PaymentProviderBinding[] = [
  { paymentMethod: 'card', adapterCode: 'stripe' },
];

/**
 * Lee `PAYMENT_PROVIDER_BINDINGS` con formato `card=stripe,wallet=otro`.
 * Permite cambiar el mapeo método -> adaptador por entorno sin tocar el código.
 */
export function parsePaymentProviderBindings(raw: string): PaymentProviderBinding[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new InvalidPaymentProviderBindingsError(raw, 'no contiene ningún binding.');
  }

  return entries.map((entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0 || separator === entry.length - 1) {
      throw new InvalidPaymentProviderBindingsError(
        raw,
        `el binding "${entry}" no tiene el formato metodo=adaptador.`,
      );
    }
    return {
      paymentMethod: entry.slice(0, separator).trim(),
      adapterCode: entry.slice(separator + 1).trim(),
    };
  });
}