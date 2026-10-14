import { PaymentEventsWebhookHandler } from './payment-events-webhook.handler';

const TENANT = '11111111-1111-4111-8111-111111111111';
const PAYMENT = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';

function setup(webhookIds: string[], pending: string[]) {
  const bus = { subscribe: jest.fn() };
  const repo = {
    findSubscribedWebhookIds: jest.fn().mockResolvedValue(webhookIds),
    createDeliveries: jest.fn().mockResolvedValue(pending),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const handler = new PaymentEventsWebhookHandler(bus as never, repo as never, queue as never);
  return { handler, bus, repo, queue };
}

const event = (payload: Record<string, unknown>, tenantId: string | null = TENANT) =>
  ({ eventId: EVENT, eventName: 'pago.aprobado', occurredOn: '2026-10-08T12:00:00.000Z', aggregateId: PAYMENT, tenantId, payload }) as never;

describe('PaymentEventsWebhookHandler', () => {
  it('se suscribe a pago.creado, pago.aprobado y pago.rechazado', () => {
    const { handler, bus } = setup([], []);
    handler.onModuleInit();
    expect(bus.subscribe.mock.calls.map((c) => c[0])).toEqual(['pago.creado', 'pago.aprobado', 'pago.rechazado']);
  });

  it('crea una entrega por endpoint suscrito del mismo ambiente y la encola', async () => {
    const { handler, repo, queue } = setup(['w-1', 'w-2'], ['d-1', 'd-2']);
    await handler.handle(event({ paymentId: PAYMENT, environment: 'sandbox' }));

    expect(repo.findSubscribedWebhookIds).toHaveBeenCalledWith(TENANT, 'pago.aprobado', 'sandbox');
    expect(repo.createDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT,
        paymentId: PAYMENT,
        envelope: expect.objectContaining({ version: 1, eventId: EVENT, eventName: 'pago.aprobado', tenantId: TENANT }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledWith({ deliveryId: 'd-1', attempt: 1 });
  });

  it('un evento repetido no vuelve a encolar entregas ya creadas', async () => {
    const { handler, queue } = setup(['w-1'], []);
    await handler.handle(event({ paymentId: PAYMENT, environment: 'production' }));
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('no hace nada si el tenant no tiene endpoints suscritos', async () => {
    const { handler, repo } = setup([], []);
    await handler.handle(event({ paymentId: PAYMENT }));
    expect(repo.createDeliveries).not.toHaveBeenCalled();
  });

  it('ignora eventos sin tenant', async () => {
    const { handler, repo } = setup(['w-1'], ['d-1']);
    await handler.handle(event({ paymentId: PAYMENT }, null));
    expect(repo.findSubscribedWebhookIds).not.toHaveBeenCalled();
  });
});
