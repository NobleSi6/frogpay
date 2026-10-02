import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HealthController } from '../src/modules/health/presentation/http/health.controller';
import { ApiHealthIndicator } from '../src/modules/health/indicators/api.health-indicator';
import { DatabaseHealthIndicator } from '../src/modules/health/indicators/database.health-indicator';
import { EventBusHealthIndicator } from '../src/modules/health/indicators/event-bus.health-indicator';

describe('Health endpoint (e2e)', () => {
  let app: INestApplication;
  const apiHealth = { check: jest.fn() };
  const databaseHealth = { check: jest.fn() };
  const eventBusHealth = { check: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: ApiHealthIndicator, useValue: apiHealth },
        { provide: DatabaseHealthIndicator, useValue: databaseHealth },
        { provide: EventBusHealthIndicator, useValue: eventBusHealth },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  beforeEach(() => {
    apiHealth.check.mockReturnValue({ status: 'up', uptime: 1 });
    databaseHealth.check.mockResolvedValue({ status: 'up', type: 'postgresql', latencyMs: 1 });
    eventBusHealth.check.mockResolvedValue({ status: 'up', provider: 'in-memory' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 and the service health payload at the public /health route', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      services: {
        api: { status: 'up' },
        database: { status: 'up' },
        eventBus: { status: 'up' },
      },
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('returns 503 when a critical service is down', async () => {
    databaseHealth.check.mockResolvedValue({ status: 'down', type: 'postgresql', latencyMs: -1 });

    const response = await request(app.getHttpServer()).get('/health').expect(503);

    expect(response.body).toMatchObject({
      status: 'degraded',
      services: { database: { status: 'down' } },
    });
  });
});
