/**
 * Circuit Breaker con ventana deslizante (TSK-DEV2-304, ADR-007).
 *
 *  CLOSED    ── tasa de fallos > umbral en la ventana (con mínimo de solicitudes) ──▶ OPEN
 *  OPEN      ── pasa el tiempo de espera ──▶ HALF_OPEN (deja pasar 1 solicitud de prueba)
 *  HALF_OPEN ── la prueba tiene éxito ──▶ CLOSED   |   la prueba falla ──▶ OPEN
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Proporción de fallos que abre el circuito (0.5 = más del 50 %). */
  failureRateThreshold: number;
  /** Ventana de observación en milisegundos (60.000 = 1 minuto). */
  windowMs: number;
  /** Mínimo de solicitudes en la ventana antes de evaluar la tasa. */
  minimumRequests: number;
  /** Tiempo en OPEN antes de probar de nuevo (HALF_OPEN). */
  openDurationMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureRateThreshold: 0.5,
  windowMs: 60_000,
  minimumRequests: 5,
  openDurationMs: 30_000,
};

export interface CircuitSnapshot {
  name: string;
  state: CircuitState;
  failureRate: number;
  requestsInWindow: number;
  openedAt: string | null;
  nextAttemptAt: string | null;
}

export type StateChangeListener = (name: string, from: CircuitState, to: CircuitState, snapshot: CircuitSnapshot) => void;

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private outcomes: Array<{ at: number; ok: boolean }> = [];
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor(
    readonly name: string,
    private readonly options: CircuitBreakerOptions = DEFAULT_CIRCUIT_BREAKER_OPTIONS,
    private readonly now: () => number = Date.now,
    private readonly onStateChange?: StateChangeListener,
  ) {}

  /** ¿Se puede llamar al proveedor ahora? En HALF_OPEN solo pasa una solicitud de prueba a la vez. */
  tryAcquire(): boolean {
    if (this.state === 'OPEN') {
      if (this.openedAt !== null && this.now() - this.openedAt >= this.options.openDurationMs) {
        this.transition('HALF_OPEN');
      } else {
        return false;
      }
    }
    if (this.state === 'HALF_OPEN') {
      if (this.trialInFlight) return false;
      this.trialInFlight = true;
    }
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.trialInFlight = false;
      this.outcomes = [];
      this.transition('CLOSED');
      return;
    }
    this.push(true);
  }

  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.trialInFlight = false;
      this.open();
      return;
    }
    this.push(false);
    const { total, failureRate } = this.stats();
    if (this.state === 'CLOSED' && total >= this.options.minimumRequests && failureRate > this.options.failureRateThreshold) {
      this.open();
    }
  }

  snapshot(): CircuitSnapshot {
    const { total, failureRate } = this.stats();
    return {
      name: this.name,
      state: this.state,
      failureRate: Math.round(failureRate * 100) / 100,
      requestsInWindow: total,
      openedAt: this.openedAt !== null ? new Date(this.openedAt).toISOString() : null,
      nextAttemptAt:
        this.state === 'OPEN' && this.openedAt !== null
          ? new Date(this.openedAt + this.options.openDurationMs).toISOString()
          : null,
    };
  }

  private open(): void {
    this.openedAt = this.now();
    this.transition('OPEN');
  }

  private push(ok: boolean): void {
    this.outcomes.push({ at: this.now(), ok });
    this.prune();
  }

  private prune(): void {
    const limit = this.now() - this.options.windowMs;
    while (this.outcomes.length > 0 && this.outcomes[0].at < limit) this.outcomes.shift();
  }

  private stats(): { total: number; failureRate: number } {
    this.prune();
    const total = this.outcomes.length;
    const failures = this.outcomes.filter((outcome) => !outcome.ok).length;
    return { total, failureRate: total === 0 ? 0 : failures / total };
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    if (to === 'CLOSED') this.openedAt = null;
    this.onStateChange?.(this.name, from, to, this.snapshot());
  }
}
