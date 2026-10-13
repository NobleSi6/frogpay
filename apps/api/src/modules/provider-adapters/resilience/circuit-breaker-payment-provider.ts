import {
  AuthorizeInput,
  CaptureInput,
  PaymentProviderPort,
  ProviderResult,
  QueryStatusInput,
} from '../ports/payment-provider.port';
import { CircuitBreaker } from './circuit-breaker';

/** Respuesta inmediata cuando el circuito está abierto: no se llama al proveedor. */
export const PROVIDER_UNAVAILABLE_RESULT: ProviderResult = {
  outcome: 'error',
  errorCode: 'provider_unavailable',
};

/**
 * Decorador del puerto (patrón Decorator): envuelve cualquier adaptador sin
 * cambiarlo y sin que el módulo de Pagos se entere. Un rechazo del emisor
 * (`declined`) es una respuesta válida del proveedor y NO cuenta como fallo;
 * sí cuentan los timeouts, los errores técnicos y las excepciones.
 */
export class CircuitBreakerPaymentProvider implements PaymentProviderPort {
  constructor(
    private readonly inner: PaymentProviderPort,
    readonly breaker: CircuitBreaker,
  ) {}

  authorize(input: AuthorizeInput): Promise<ProviderResult> {
    return this.call(() => this.inner.authorize(input));
  }

  capture(input: CaptureInput): Promise<ProviderResult> {
    return this.call(() => this.inner.capture(input));
  }

  queryStatus(input: QueryStatusInput): Promise<ProviderResult> {
    return this.call(() => this.inner.queryStatus(input));
  }

  private async call(operation: () => Promise<ProviderResult>): Promise<ProviderResult> {
    if (!this.breaker.tryAcquire()) return { ...PROVIDER_UNAVAILABLE_RESULT };
    try {
      const result = await operation();
      if (result.outcome === 'timeout' || result.outcome === 'error') this.breaker.recordFailure();
      else this.breaker.recordSuccess();
      return result;
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }
}
