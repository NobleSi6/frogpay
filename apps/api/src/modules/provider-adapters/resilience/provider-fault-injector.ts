import { Injectable, Logger } from '@nestjs/common';

/**
 * Inyección de fallos controlada para demostrar la caída de un proveedor
 * (TSK-DEV2-305). Solo existe en sandbox: en producción se rechaza.
 *
 * - mode "error":   el proveedor "no responde" → provider_unavailable al instante.
 * - mode "latency": se agrega una demora antes de llamar al proveedor; si llega
 *                   al timeout de 3.000 ms, la llamada termina en timeout.
 */
export type ProviderFaultMode = 'error' | 'latency';

export interface ProviderFault {
  provider: string;
  mode: ProviderFaultMode;
  latencyMs: number;
  until: Date;
}

export const PROVIDER_CALL_TIMEOUT_MS = 3000;

@Injectable()
export class ProviderFaultInjector {
  private readonly logger = new Logger(ProviderFaultInjector.name);
  private readonly faults = new Map<string, ProviderFault>();

  constructor(private readonly now: () => number = Date.now) {}

  inject(input: { provider: string; mode: ProviderFaultMode; durationSeconds: number; latencyMs?: number }): ProviderFault {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('La inyección de fallos no está disponible en producción.');
    }
    const provider = normalize(input.provider);
    const fault: ProviderFault = {
      provider,
      mode: input.mode,
      latencyMs: input.mode === 'latency' ? Math.max(0, input.latencyMs ?? PROVIDER_CALL_TIMEOUT_MS) : 0,
      until: new Date(this.now() + input.durationSeconds * 1000),
    };
    this.faults.set(provider, fault);
    this.logger.warn(
      `Falla simulada en ${provider}: ${fault.mode}${fault.latencyMs ? ` (${fault.latencyMs} ms)` : ''} hasta ${fault.until.toISOString()}`,
    );
    return fault;
  }

  clear(provider?: string): void {
    if (provider) this.faults.delete(normalize(provider));
    else this.faults.clear();
    this.logger.warn(`Falla simulada eliminada: ${provider ?? 'todos los proveedores'}`);
  }

  active(provider: string): ProviderFault | null {
    const key = normalize(provider);
    const fault = this.faults.get(key);
    if (!fault) return null;
    if (fault.until.getTime() <= this.now()) {
      this.faults.delete(key);
      return null;
    }
    return fault;
  }

  list(): ProviderFault[] {
    return [...this.faults.keys()].map((key) => this.active(key)).filter((f): f is ProviderFault => f !== null);
  }
}

function normalize(provider: string): string {
  return provider.trim().toLowerCase();
}
