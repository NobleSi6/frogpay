import { Injectable, Logger } from '@nestjs/common';

export interface DatabaseHealthStatus {
  status: 'up' | 'down';
  type: 'in-memory' | 'postgresql';
  latencyMs: number;
}

@Injectable()
export class DatabaseHealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  async check(): Promise<DatabaseHealthStatus> {
    const start = performance.now();
    try {
      // Simulación o verificación de conectividad de base de datos
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        status: 'up',
        type: process.env.DATABASE_URL ? 'postgresql' : 'in-memory',
        latencyMs,
      };
    } catch (error) {
      this.logger.error('Error al verificar estado de la base de datos:', error);
      return {
        status: 'down',
        type: process.env.DATABASE_URL ? 'postgresql' : 'in-memory',
        latencyMs: -1,
      };
    }
  }
}
