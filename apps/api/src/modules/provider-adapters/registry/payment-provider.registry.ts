import { Logger } from '@nestjs/common';
import { PaymentProviderPort } from '../ports/payment-provider.port';
import {
  DuplicatePaymentProviderBindingError,
  MissingPaymentProviderBindingError,
  normalizeCode,
  PaymentProviderBinding,
  PaymentProviderRegistration,
  UnsupportedPaymentMethodError,
} from './payment-provider.binding';

/**
 * Strategy: resuelve el adaptador de un método de pago sin que el núcleo
 * (`payments`) ni el registry contengan condiciones por proveedor. La selección
 * es una tabla de datos; agregar un proveedor es agregar un binding.
 *
 * Se construyen dos tablas: los adaptadores disponibles, indexados por su
 * código, y los bindings método de pago -> adaptador. La tabla de bindings
 * puede venir del módulo o de la configuración, de modo que cambiar el mapeo no
 * obliga a tocar el código.
 */
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly adaptersByCode = new Map<string, PaymentProviderPort>();
  private readonly adaptersByPaymentMethod = new Map<string, PaymentProviderPort>();

  constructor(
    registrations: readonly PaymentProviderRegistration[],
    defaultBindings: readonly PaymentProviderBinding[],
  ) {
    for (const registration of registrations) {
      this.adaptersByCode.set(normalizeCode(registration.adapterCode), registration.adapter);
    }
    this.applyBindings(defaultBindings);
  }

  supportedPaymentMethods(): string[] {
    return [...this.adaptersByPaymentMethod.keys()].sort();
  }

  supportedAdapterCodes(): string[] {
    return [...this.adaptersByCode.keys()].sort();
  }

  resolve(paymentMethod: string): PaymentProviderPort {
    const key = normalizeCode(paymentMethod);
    const adapter = this.adaptersByPaymentMethod.get(key);
    if (!adapter) {
      throw new UnsupportedPaymentMethodError(key, this.supportedPaymentMethods());
    }
    return adapter;
  }

  /**
   * Aplica una tabla de bindings. Si `replace` es falso (por defecto) solo se
   * sobreescribe el binding de los métodos de pago indicados.
   */
  applyBindings(bindings: readonly PaymentProviderBinding[], replace = false): void {
    const duplicates = this.findDuplicates(bindings);
    if (duplicates) {
      throw new DuplicatePaymentProviderBindingError(duplicates.paymentMethod, duplicates.adapterCodes);
    }

    if (replace) {
      this.adaptersByPaymentMethod.clear();
    }

    for (const binding of bindings) {
      const paymentMethod = normalizeCode(binding.paymentMethod);
      const adapter = this.adaptersByCode.get(normalizeCode(binding.adapterCode));
      if (!adapter) {
        throw new MissingPaymentProviderBindingError(binding.adapterCode, paymentMethod);
      }
      this.adaptersByPaymentMethod.set(paymentMethod, adapter);
    }

    this.logger.log(
      `Adaptadores de proveedor: ${this.supportedAdapterCodes().join(', ') || 'ninguno'}. ` +
        `Métodos de pago: ${this.supportedPaymentMethods().join(', ') || 'ninguno'}.`,
    );
  }

  private findDuplicates(
    bindings: readonly PaymentProviderBinding[],
  ): { paymentMethod: string; adapterCodes: string[] } | undefined {
    const seen = new Map<string, string[]>();
    for (const binding of bindings) {
      const paymentMethod = normalizeCode(binding.paymentMethod);
      const adapterCodes = seen.get(paymentMethod) ?? [];
      adapterCodes.push(binding.adapterCode);
      seen.set(paymentMethod, adapterCodes);
    }

    for (const [paymentMethod, adapterCodes] of seen) {
      if (adapterCodes.length > 1) {
        return { paymentMethod, adapterCodes };
      }
    }
    return undefined;
  }
}