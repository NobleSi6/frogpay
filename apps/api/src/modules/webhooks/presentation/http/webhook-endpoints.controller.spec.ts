import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { HttpExceptionFilter } from '../../../../shared/http/http-exception.filter';
import { WebhookEndpointsService } from '../../application/use-cases/webhook-endpoints.service';
import { WebhookEndpointsController } from './webhook-endpoints.controller';

describe('WebhookEndpointsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'w-1', secret: 'whsec_x' }),
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn(),
    update: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    rotateSecret: jest.fn(),
    sendTestEvent: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookEndpointsController],
      providers: [{ provide: WebhookEndpointsService, useValue: service }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.use((req: { tenantContext?: unknown }, _res: unknown, next: () => void) => {
      req.tenantContext = { tenantId: '11111111-1111-4111-8111-111111111111', userId: 'u-1', role: 'OWNER' };
      next();
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('crea un endpoint con datos válidos usando el tenant de la sesión', async () => {
    await request(app.getHttpServer())
      .post('/dashboard/webhooks')
      .send({ url: 'https://mi-tienda.com/hook', eventTypes: ['pago.aprobado'] })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ url: 'https://mi-tienda.com/hook' }),
    );
  });

  it('rechaza eventos no permitidos con validation_error', async () => {
    const res = await request(app.getHttpServer())
      .post('/dashboard/webhooks')
      .send({ url: 'https://mi-tienda.com/hook', eventTypes: ['pago.inventado'] })
      .expect(422);
    expect(res.body.code).toBe('validation_error');
  });

  it('no acepta un tenantId enviado por el cliente', async () => {
    await request(app.getHttpServer())
      .post('/dashboard/webhooks')
      .send({ url: 'https://mi-tienda.com/hook', eventTypes: ['pago.aprobado'], tenantId: 'otro' })
      .expect(422);
  });

  it('valida que el id sea un UUID', async () => {
    await request(app.getHttpServer()).delete('/dashboard/webhooks/no-es-uuid').expect(422);
  });

  it('eliminar responde 204', async () => {
    await request(app.getHttpServer()).delete('/dashboard/webhooks/44444444-4444-4444-8444-444444444444').expect(204);
  });
});
