import {
  AuthorizeInput,
  CaptureInput,
  PaymentProviderPort,
  ProviderMetadata,
  ProviderResult,
  QueryStatusInput,
} from '../ports/payment-provider.port';
import { CircuitBreaker } from './circuit-breaker';
import { PROVIDER_CALL_TIMEOUT_MS, ProviderFaultInjector } from './provider-fault-injector';

/** Respuesta inmediata cuando el circuito está abierto: no se llama al proveedor. */
export const PROVIDER_UNAVAILABLE_RESULT: ProviderResult = {
  outcome: 'error',
  errorCode: 'provider_unavailable',
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Decorador del puerto (patrón Decorator): envuelve cualquier adaptador sin
 * cambiarlo y sin que el módulo de Pagos se entere. Un rechazo del emisor
 * (`declined`) es una respuesta válida del proveedor y NO cuenta como fallo;
 * sí cuentan los timeouts, los errores técnicos y las excepciones.
 * En sandbox también aplica las fallas simuladas (TSK-DEV2-305).
 */
export class CircuitBreakerPaymentProvider implements PaymentProviderPort {
  constructor(
    private readonly inner: PaymentProviderPort,
    readonly breaker: CircuitBreaker,
    private readonly faults?: ProviderFaultInjector,
  ) {}

  /** Los metadatos (métodos, comisiones, modo) son los del adaptador original. */
  get metadata(): ProviderMetadata {
    return this.inner.metadata;
  }

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
      const result = await this.withSimulatedFault(operation);
      if (result.outcome === 'timeout' || result.outcome === 'error') this.breaker.recordFailure();
      else this.breaker.recordSuccess();
      return result;
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }

  private async withSimulatedFault(operation: () => Promise<ProviderResult>): Promise<ProviderResult> {
    const fault = this.faults?.active(this.breaker.name);
    if (!fault) return operation();
    if (fault.mode === 'error') return { ...PROVIDER_UNAVAILABLE_RESULT };
    if (fault.latencyMs >= PROVIDER_CALL_TIMEOUT_MS) {
      await sleep(PROVIDER_CALL_TIMEOUT_MS);
      return { outcome: 'timeout', errorCode: 'provider_timeout' };
    }
    await sleep(fault.latencyMs);
    return operation();
  }
}
