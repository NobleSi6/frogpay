import { Injectable } from '@nestjs/common';
import { DatabaseHealthService } from '../../../shared/database/database-health.service';

export interface DatabaseHealthStatus {
  status: 'up' | 'down';
  type: 'postgresql';
  latencyMs: number;
}

@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  async check(): Promise<DatabaseHealthStatus> {
    const start = performance.now();
    const healthy = await this.databaseHealth.check();
    return {
      status: healthy ? 'up' : 'down',
      type: 'postgresql',
      latencyMs: healthy ? Math.round((performance.now() - start) * 100) / 100 : -1,
    };
  }
}
