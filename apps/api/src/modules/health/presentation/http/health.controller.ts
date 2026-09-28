import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../../../shared/auth/public.decorator';
import { ApiHealthIndicator } from '../../indicators/api.health-indicator';
import { DatabaseHealthIndicator } from '../../indicators/database.health-indicator';
import { EventBusHealthIndicator } from '../../indicators/event-bus.health-indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly apiHealth: ApiHealthIndicator,
    private readonly dbHealth: DatabaseHealthIndicator,
    private readonly eventBusHealth: EventBusHealthIndicator,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Verificar estado de salud del sistema FrogPay (TSK-BACK1-105)',
    description:
      'Endpoint público para monitoreo, sondas de Kubernetes / AWS ALB y verificación de disponibilidad de servicios (API, Base de Datos, Event Bus). Retorna 200 si todo está saludable o 503 si algún componente crítico está caído.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'El sistema y todos sus componentes están operando correctamente.',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-09-28T15:00:00.000Z',
        services: {
          api: {
            status: 'up',
            uptime: 3600,
            memoryUsageMb: 45.2,
            nodeVersion: 'v22.0.0',
            environment: 'development',
          },
          database: {
            status: 'up',
            type: 'in-memory',
            latencyMs: 1.2,
          },
          eventBus: {
            status: 'up',
            provider: 'in-memory',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Uno o más componentes críticos del sistema están caídos.',
  })
  async checkHealth(@Res() res: Response): Promise<Response> {
    const api = this.apiHealth.check();
    const db = await this.dbHealth.check();
    const eventBus = await this.eventBusHealth.check();

    const isHealthy = api.status === 'up' && db.status === 'up' && eventBus.status === 'up';

    const payload = {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api,
        database: db,
        eventBus,
      },
    };

    const statusCode = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json(payload);
  }
}
