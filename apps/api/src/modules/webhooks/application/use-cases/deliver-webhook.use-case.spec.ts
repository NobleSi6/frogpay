import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { propagation } from '@opentelemetry/api';
import { runWithRequestId } from '../../../../shared/observability/request-context';
import { verifySignature } from '../../domain/webhook-signature';
import { WebhookHttpClient } from '../../infrastructure/http/webhook-http.client';
import { DeliverWebhookUseCase } from './deliver-webhook.use-case';

const SECRET = 'whsec_secreto_de_prueba';

function startReceiver(
  respond: (req: IncomingMessage, body: string) => number,
) {
  const received: Array<{ headers: IncomingMessage['headers']; body: string }> =
    [];
  const server: Server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.statusCode = respond(req, body);
        res.end('ok');
      });
    },
  );
  return new Promise<{
    url: string;
    received: typeof received;
    close: () => Promise<void>;
  }>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/webhooks`,
        received,
        close: () => new Promise((done) => server.close(() => done())),
      });
    }),
  );
}

function setup(
  url: string,
  overrides: { claim?: boolean; usable?: boolean } = {},
) {
  const repo = {
    claimAttempt: jest.fn().mockResolvedValue(overrides.claim ?? true),
    loadForDispatch: jest.fn().mockResolvedValue({
      id: 'd-1',
      tenantId: 't-1',
      webhookId: 'w-1',
      eventId: 'e-1',
      eventType: 'pago.aprobado',
      payload: {
        version: 1,
        eventId: 'e-1',
        eventName: 'pago.aprobado',
        occurredOn: '2026-10-08T00:00:00.000Z',
        tenantId: 't-1',
        payload: { paymentId: 'p-1' },
      },
      attemptCount: 1,
      webhook: {
        url,
        secretEncrypted: 'cifrado',
        usable: overrides.usable ?? true,
      },
    }),
    recordAttempt: jest.fn().mockResolvedValue(undefined),
  };
  const queue = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    sendToDeadLetter: jest.fn().mockResolvedValue(undefined),
  };
  const cipher = {
    encrypt: jest.fn(),
    decrypt: jest.fn().mockReturnValue(SECRET),
  };
  const http = new WebhookHttpClient(
    new ConfigService({ WEBHOOK_TIMEOUT_MS: '500' }),
  );
  const useCase = new DeliverWebhookUseCase(
    repo as never,
    http,
    queue as never,
    cipher,
  );
  return { useCase, repo, queue };
}

describe('DeliverWebhookUseCase', () => {
  it('entrega un webhook firmado que el receptor puede validar', async () => {
    const receiver = await startReceiver(() => 200);
    const { useCase, repo, queue } = setup(receiver.url);

    await expect(
      useCase.execute({ deliveryId: 'd-1', attempt: 1 }),
    ).resolves.toBe('delivered');

    const [request] = receiver.received;
    expect(request.headers['frogpay-event-id']).toBe('e-1');
    expect(request.headers['frogpay-delivery-id']).toBe('d-1');
    expect(
      verifySignature({
        secret: SECRET,
        header: request.headers['frogpay-signature'] as string,
        rawBody: request.body,
      }),
    ).toBe(true);
    expect(
      verifySignature({
        secret: SECRET,
        header: request.headers['frogpay-signature'] as string,
        rawBody: request.body.replace('p-1', 'p-9'),
      }),
    ).toBe(false);
    expect(repo.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: true, responseCode: 200 }),
      { kind: 'delivered' },
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
    await receiver.close();
  });

  it('propaga traceparent y request id al webhook saliente', async () => {
    const receiver = await startReceiver(() => 200);
    const { useCase } = setup(receiver.url);
    const inject = jest
      .spyOn(propagation, 'inject')
      .mockImplementation((_ctx, carrier) => {
        if (typeof carrier === 'object' && carrier !== null) {
          Reflect.set(
            carrier,
            'traceparent',
            '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          );
        }
      });

    try {
      await runWithRequestId('req_webhook_trace_123', () =>
        useCase.execute({ deliveryId: 'd-1', attempt: 1 }),
      );

      const [request] = receiver.received;
      expect(request.headers.traceparent).toBe(
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      );
      expect(request.headers['x-request-id']).toBe('req_webhook_trace_123');
    } finally {
      inject.mockRestore();
      await receiver.close();
    }
  });

  it('ante HTTP 500 programa el siguiente intento con 1 s de espera', async () => {
    const receiver = await startReceiver(() => 500);
    const { useCase, repo, queue } = setup(receiver.url);

    await expect(
      useCase.execute({ deliveryId: 'd-1', attempt: 1 }),
    ).resolves.toBe('retry_scheduled');
    expect(repo.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: false, responseCode: 500 }),
      expect.objectContaining({ kind: 'retry' }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      { deliveryId: 'd-1', attempt: 2 },
      1000,
    );
    await receiver.close();
  });

  it('usa retrasos crecientes: el intento 5 espera 16 s', async () => {
    const receiver = await startReceiver(() => 503);
    const { useCase, queue } = setup(receiver.url);
    await useCase.execute({ deliveryId: 'd-1', attempt: 5 });
    expect(queue.enqueue).toHaveBeenCalledWith(
      { deliveryId: 'd-1', attempt: 6 },
      16000,
    );
    await receiver.close();
  });

  it('tras el sexto intento fallido marca la entrega como failed y la envía a la DLQ', async () => {
    const receiver = await startReceiver(() => 500);
    const { useCase, repo, queue } = setup(receiver.url);

    await expect(
      useCase.execute({ deliveryId: 'd-1', attempt: 6 }),
    ).resolves.toBe('failed');
    expect(repo.recordAttempt).toHaveBeenCalledWith(expect.anything(), {
      kind: 'failed',
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(queue.sendToDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 'd-1', attempts: 6 }),
    );
    await receiver.close();
  });

  it('un reenvío manual fallido no abre una nueva ronda de reintentos', async () => {
    const receiver = await startReceiver(() => 500);
    const { useCase, queue } = setup(receiver.url);
    await expect(
      useCase.execute({ deliveryId: 'd-1', attempt: 7, manual: true }),
    ).resolves.toBe('failed');
    expect(queue.enqueue).not.toHaveBeenCalled();
    await receiver.close();
  });

  it('un error de red cuenta como fallo y se reintenta', async () => {
    const { useCase, repo } = setup('http://127.0.0.1:1/no-existe');
    await expect(
      useCase.execute({ deliveryId: 'd-1', attempt: 1 }),
    ).resolves.toBe('retry_scheduled');
    expect(repo.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        responseCode: null,
        error: expect.stringContaining('Error de red'),
      }),
      expect.objectContaining({ kind: 'retry' }),
    );
  });

  it('ignora mensajes repetidos cuyo intento ya fue tomado', async () => {
    const { useCase, repo } = setup('http://127.0.0.1:1', { claim: false });
    await expect(
      useCase.execute({ deliveryId: 'd-1', attempt: 2 }),
    ).resolves.toBe('skipped');
    expect(repo.loadForDispatch).not.toHaveBeenCalled();
  });

  it('no envía a endpoints desactivados', async () => {
    const { useCase, repo } = setup('http://127.0.0.1:1', { usable: false });
    await expect(
      useCase.execute({ deliveryId: 'd-1', attempt: 1 }),
    ).resolves.toBe('failed');
    expect(repo.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: false }),
      { kind: 'failed' },
    );
  });
});
