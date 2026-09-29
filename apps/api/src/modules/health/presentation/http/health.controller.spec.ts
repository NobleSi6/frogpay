import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { ApiHealthIndicator } from '../../indicators/api.health-indicator';
import { DatabaseHealthIndicator } from '../../indicators/database.health-indicator';
import { EventBusHealthIndicator } from '../../indicators/event-bus.health-indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let apiHealth: jest.Mocked<ApiHealthIndicator>;
  let dbHealth: jest.Mocked<DatabaseHealthIndicator>;
  let eventBusHealth: jest.Mocked<EventBusHealthIndicator>;

  let mockResponse: Partial<Response>;

  beforeEach(() => {
    apiHealth = {
      check: jest.fn().mockResolvedValue({
        status: 'up',
        uptime: 100,
        memoryUsageMb: 50,
        nodeVersion: 'v22.0.0',
        environment: 'test',
      }),
    } as unknown as jest.Mocked<ApiHealthIndicator>;

    dbHealth = {
      check: jest.fn().mockResolvedValue({
        status: 'up',
        type: 'postgresql',
        latencyMs: 1.5,
      }),
    } as unknown as jest.Mocked<DatabaseHealthIndicator>;

    eventBusHealth = {
      check: jest.fn().mockReturnValue({
        status: 'up',
        provider: 'in-memory',
      }),
    } as unknown as jest.Mocked<EventBusHealthIndicator>;

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    controller = new HealthController(apiHealth, dbHealth, eventBusHealth);
  });

  it('debe retornar HTTP 200 y status "ok" cuando todos los servicios están UP', async () => {
    await controller.checkHealth(mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        services: expect.objectContaining({
          api: expect.objectContaining({ status: 'up' }),
          database: expect.objectContaining({ status: 'up' }),
          eventBus: expect.objectContaining({ status: 'up' }),
        }),
      }),
    );
  });

  it('debe retornar HTTP 503 y status "degraded" cuando un servicio está DOWN', async () => {
    dbHealth.check.mockResolvedValueOnce({
      status: 'down',
      type: 'postgresql',
      latencyMs: -1,
    });

    await controller.checkHealth(mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
      }),
    );
  });
});
