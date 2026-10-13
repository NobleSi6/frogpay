import { Logger } from '@nestjs/common';
import { PaymentMethodCapability, PaymentProviderPort } from '../ports/payment-provider.port';
import {
  DuplicatePaymentProviderBindingError,
  InvalidPaymentProviderBindingsError,
  MissingPaymentProviderBindingError,
  normalizeCode,
  PaymentProviderBinding,
  PaymentProviderRegistration,
  UnsupportedPaymentMethodError,
  UnsupportedPaymentProviderBindingError,
} from './payment-provider.binding';

export interface RegisteredPaymentMethod extends PaymentMethodCapability {
  providerId: string;
}

interface ResolvedPaymentProvider {
  adapter: PaymentProviderPort;
  capability: PaymentMethodCapability;
  providerId: string;
}

/**
 * Builds a method-to-adapter strategy from adapter metadata, then applies
 * explicit configuration bindings where multiple adapters support a method.
 */
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly adaptersByCode = new Map<string, PaymentProviderPort>();
  private readonly adaptersByPaymentMethod = new Map<string, ResolvedPaymentProvider>();

  constructor(
    registrations: readonly PaymentProviderRegistration[],
    defaultBindings: readonly PaymentProviderBinding[],
  ) {
    for (const registration of registrations) {
      const adapterCode = normalizeCode(registration.adapterCode);
      const metadataId = normalizeCode(registration.adapter.metadata.id);
      if (adapterCode !== metadataId) {
        throw new InvalidPaymentProviderBindingsError(
          registration.adapterCode,
          `no coincide con el id de metadata "${registration.adapter.metadata.id}".`,
        );
      }
      if (this.adaptersByCode.has(adapterCode)) {
        throw new InvalidPaymentProviderBindingsError(
          registration.adapterCode,
          'el id del adaptador está registrado más de una vez.',
        );
      }
      this.adaptersByCode.set(adapterCode, registration.adapter);
    }

    this.bindMetadataMethods(defaultBindings);
    this.applyBindings(defaultBindings);
  }

  supports(paymentMethod: string): boolean {
    return this.adaptersByPaymentMethod.has(normalizeCode(paymentMethod));
  }

  capabilityOf(paymentMethod: string): PaymentMethodCapability {
    const key = normalizeCode(paymentMethod);
    const resolved = this.adaptersByPaymentMethod.get(key);
    if (!resolved) {
      throw new UnsupportedPaymentMethodError(key, this.supportedPaymentMethods());
    }
    return resolved.capability;
  }

  listMethods(): RegisteredPaymentMethod[] {
    return [...this.adaptersByPaymentMethod.values()]
      .map(({ capability, providerId }) => ({ ...capability, providerId }))
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  supportedPaymentMethods(): string[] {
    return [...this.adaptersByPaymentMethod.keys()].sort();
  }

  supportedAdapterCodes(): string[] {
    return [...this.adaptersByCode.keys()].sort();
  }

  resolve(paymentMethod: string): PaymentProviderPort {
    const key = normalizeCode(paymentMethod);
    const resolved = this.adaptersByPaymentMethod.get(key);
    if (!resolved) {
      throw new UnsupportedPaymentMethodError(key, this.supportedPaymentMethods());
    }
    return resolved.adapter;
  }

  /**
   * Applies an explicit method-to-adapter table. With replace=true, the table
   * becomes the complete enabled-method configuration.
   */
  applyBindings(bindings: readonly PaymentProviderBinding[], replace = false): void {
    const duplicates = this.findDuplicates(bindings);
    if (duplicates) {
      throw new DuplicatePaymentProviderBindingError(
        duplicates.paymentMethod,
        duplicates.adapterCodes,
      );
    }

    const resolvedBindings = bindings.map((binding) => {
      const paymentMethod = normalizeCode(binding.paymentMethod);
      const adapterCode = normalizeCode(binding.adapterCode);
      const adapter = this.adaptersByCode.get(adapterCode);
      if (!adapter) {
        throw new MissingPaymentProviderBindingError(binding.adapterCode, paymentMethod);
      }

      const capability = adapter.metadata.methods.find(
        (method) => normalizeCode(method.code) === paymentMethod,
      );
      if (!capability) {
        throw new UnsupportedPaymentProviderBindingError(binding.adapterCode, paymentMethod);
      }

      return { paymentMethod, adapterCode, adapter, capability };
    });

    if (replace) {
      this.adaptersByPaymentMethod.clear();
    }

    for (const binding of resolvedBindings) {
      this.adaptersByPaymentMethod.set(binding.paymentMethod, {
        adapter: binding.adapter,
        capability: binding.capability,
        providerId: binding.adapterCode,
      });
    }

    this.logger.log(
      `Adaptadores de proveedor: ${this.supportedAdapterCodes().join(', ') || 'ninguno'}. ` +
        `Métodos de pago: ${this.supportedPaymentMethods().join(', ') || 'ninguno'}.`,
    );
  }

  private bindMetadataMethods(explicitBindings: readonly PaymentProviderBinding[]): void {
    const explicitByMethod = new Map<string, string>();
    for (const binding of explicitBindings) {
      const paymentMethod = normalizeCode(binding.paymentMethod);
      const adapterCode = normalizeCode(binding.adapterCode);
      if (!this.adaptersByCode.has(adapterCode)) {
        throw new MissingPaymentProviderBindingError(binding.adapterCode, paymentMethod);
      }
      if (explicitByMethod.has(paymentMethod)) continue;
      explicitByMethod.set(paymentMethod, adapterCode);
    }

    const methods = new Map<
      string,
      Array<{ adapterCode: string; adapter: PaymentProviderPort; capability: PaymentMethodCapability }>
    >();
    for (const [adapterCode, adapter] of this.adaptersByCode) {
      const seenMethods = new Set<string>();
      for (const capability of adapter.metadata.methods) {
        const paymentMethod = normalizeCode(capability.code);
        if (seenMethods.has(paymentMethod)) {
          throw new InvalidPaymentProviderBindingsError(
            adapterCode,
            `el método "${paymentMethod}" aparece más de una vez en su metadata.`,
          );
        }
        seenMethods.add(paymentMethod);
        const candidates = methods.get(paymentMethod) ?? [];
        candidates.push({ adapterCode, adapter, capability });
        methods.set(paymentMethod, candidates);
      }
    }

    for (const [paymentMethod, candidates] of methods) {
      const configuredAdapter = explicitByMethod.get(paymentMethod);
      if (configuredAdapter) {
        const selected = candidates.find(({ adapterCode }) => adapterCode === configuredAdapter);
        if (!selected) {
          throw new UnsupportedPaymentProviderBindingError(configuredAdapter, paymentMethod);
        }
        continue;
      }
      if (candidates.length > 1) {
        throw new DuplicatePaymentProviderBindingError(
          paymentMethod,
          candidates.map(({ adapterCode }) => adapterCode),
        );
      }

      const candidate = candidates[0];
      this.adaptersByPaymentMethod.set(paymentMethod, {
        adapter: candidate.adapter,
        capability: candidate.capability,
        providerId: candidate.adapterCode,
      });
    }
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
