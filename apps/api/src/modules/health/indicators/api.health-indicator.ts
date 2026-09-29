import { Injectable } from '@nestjs/common';

export interface ApiHealthStatus {
  status: 'up' | 'down';
  uptime: number;
  memoryUsageMb: number;
  nodeVersion: string;
  environment: string;
}

@Injectable()
export class ApiHealthIndicator {
  check(): ApiHealthStatus {
    const memory = process.memoryUsage();
    return {
      status: 'up',
      uptime: Math.floor(process.uptime()),
      memoryUsageMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
