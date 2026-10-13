import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProviderPort } from '../ports/payment-provider.port';
import {
  CircuitBreaker,
  CircuitBreakerOptions,
  CircuitSnapshot,
  DEFAULT_CIRCUIT_BREAKER_OPTIONS,
} from './circuit-breaker';
import { CircuitBreakerPaymentProvider } from './circuit-breaker-payment-provider';

/**
 * Un circuito independiente por proveedor (Stripe, QR, transferencia...).
 * Se configura con CIRCUIT_BREAKER_* y expone su estado al health check.
 */
@Injectable()
export class CircuitBreakerRegistry {
  private readonly logger = new Logger(CircuitBreakerRegistry.name);
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly options: CircuitBreakerOptions;

  constructor(config: ConfigService) {
    this.options = {
      failureRateThreshold: readNumber(config, 'CIRCUIT_BREAKER_FAILURE_RATE', DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureRateThreshold),
      windowMs: readNumber(config, 'CIRCUIT_BREAKER_WINDOW_MS', DEFAULT_CIRCUIT_BREAKER_OPTIONS.windowMs),
      minimumRequests: readNumber(config, 'CIRCUIT_BREAKER_MIN_REQUESTS', DEFAULT_CIRCUIT_BREAKER_OPTIONS.minimumRequests),
      openDurationMs: readNumber(config, 'CIRCUIT_BREAKER_OPEN_MS', DEFAULT_CIRCUIT_BREAKER_OPTIONS.openDurationMs),
    };
  }

  /** Envuelve un adaptador con su circuito. Úsalo al registrar cada adaptador en el ProviderRegistry. */
  protect(providerCode: string, adapter: PaymentProviderPort): PaymentProviderPort {
    return new CircuitBreakerPaymentProvider(adapter, this.get(providerCode));
  }

  get(providerCode: string): CircuitBreaker {
    const key = providerCode.trim().toLowerCase();
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(key, this.options, Date.now, (name, from, to, snapshot) => {
        const message = `Circuito ${name}: ${from} -> ${to} (fallos ${Math.round(snapshot.failureRate * 100)}% en ${snapshot.requestsInWindow} solicitudes)`;
        if (to === 'OPEN') this.logger.error(message);
        else this.logger.warn(message);
      });
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  snapshot(): CircuitSnapshot[] {
    return [...this.breakers.values()].map((breaker) => breaker.snapshot());
  }
}

function readNumber(config: ConfigService, key: string, fallback: number): number {
  const value = Number(config.get<string>(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
