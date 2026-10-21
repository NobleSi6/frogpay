import { Body, Controller, Headers, INestApplication, Post, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import {
  buildSignatureHeader,
  SIGNATURE_HEADER,
  verifySignature,
} from '../src/modules/webhooks/domain/webhook-signature';

@Controller('test-webhook-receiver')
class TestWebhookReceiverController {
  @Post()
  receive(
    @Body() body: Record<string, unknown>,
    @Headers(SIGNATURE_HEADER) signature: string | undefined,
  ): { received: true; eventName: unknown } {
    const rawBody = JSON.stringify(body);
    if (!verifySignature({ secret: 'receiver-test-secret', header: signature, rawBody })) {
      throw new UnauthorizedException('Firma de webhook inválida.');
    }
    return { received: true, eventName: body.eventName };
  }
}

describe('Webhook signature integration contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestWebhookReceiverController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid HMAC-SHA256 signature for an approved-payment event', async () => {
    const body = {
      eventName: 'pago.aprobado',
      eventId: '9e84723b-ec5f-4bb8-a665-000000000001',
      payload: { paymentId: '8a2d8a64-d1ea-4f73-b9fe-64c507ed7391', status: 'approved' },
    };
    const rawBody = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await request(app.getHttpServer())
      .post('/api/test-webhook-receiver')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, buildSignatureHeader('receiver-test-secret', timestamp, rawBody))
      .send(rawBody)
      .expect(201);

    expect(response.body).toEqual({ received: true, eventName: 'pago.aprobado' });
  });

  it('rejects a webhook with an invalid signature', async () => {
    const body = { eventName: 'pago.aprobado', payload: { paymentId: 'payment-e2e' } };
    const timestamp = Math.floor(Date.now() / 1000);

    await request(app.getHttpServer())
      .post('/api/test-webhook-receiver')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, `t=${timestamp},v1=${'0'.repeat(64)}`)
      .send(JSON.stringify(body))
      .expect(401);
  });
});
