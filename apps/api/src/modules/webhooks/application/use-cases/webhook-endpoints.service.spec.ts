import { NotFoundException } from '@nestjs/common';
import { ValidationError } from '../../../../shared/http/errors/validation-error';
import { WebhookEndpointsService } from './webhook-endpoints.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ID = '44444444-4444-4444-8444-444444444444';

const record = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  url: 'https://mi-tienda.com/hook',
  eventTypes: ['pago.aprobado'],
  environment: 'sandbox',
  isActive: true,
  createdAt: new Date('2026-10-08T00:00:00Z'),
  updatedAt: new Date('2026-10-08T00:00:00Z'),
  ...overrides,
});

function setup() {
  const repo = {
    create: jest.fn().mockImplementation(async (_t, input) => record({ url: input.url, environment: input.environment })),
    list: jest.fn().mockResolvedValue([record()]),
    findById: jest.fn().mockResolvedValue(record()),
    update: jest.fn().mockResolvedValue(record()),
    createTestDelivery: jest.fn().mockResolvedValue('d-test'),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const cipher = { encrypt: jest.fn((s: string) => `cifrado(${s.length})`), decrypt: jest.fn() };
  return { service: new WebhookEndpointsService(repo as never, queue as never, cipher), repo, queue, cipher };
}

describe('WebhookEndpointsService', () => {
  it('crea el endpoint, guarda el secreto cifrado y lo devuelve en claro una sola vez', async () => {
    const { service, repo, cipher } = setup();
    const result = await service.create(TENANT, { url: 'https://mi-tienda.com/hook', eventTypes: ['pago.aprobado'] });

    expect(result.secret).toMatch(/^whsec_/);
    expect(cipher.encrypt).toHaveBeenCalledWith(result.secret);
    const stored = repo.create.mock.calls[0][1];
    expect(stored.secretEncrypted).not.toContain(result.secret);
    expect(stored.environment).toBe('sandbox');
  });

  it('el listado y la consulta nunca incluyen el secreto', async () => {
    const { service } = setup();
    const [item] = await service.list(TENANT);
    expect(item).not.toHaveProperty('secret');
    expect(await service.get(TENANT, ID)).not.toHaveProperty('secret');
  });

  it('rechaza http:// en producción y lo permite en sandbox', async () => {
    const { service } = setup();
    await expect(
      service.create(TENANT, { url: 'http://mi-tienda.com/hook', eventTypes: ['pago.aprobado'], environment: 'production' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.create(TENANT, { url: 'http://localhost:4010/hook', eventTypes: ['pago.aprobado'], environment: 'sandbox' }),
    ).resolves.toHaveProperty('secret');
  });

  it('valida la nueva URL según el ambiente del endpoint al actualizar', async () => {
    const { service, repo } = setup();
    repo.findById.mockResolvedValue(record({ environment: 'production' }));
    await expect(service.update(TENANT, ID, { url: 'https://127.0.0.1/hook' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rotar el secreto devuelve uno nuevo y guarda solo su versión cifrada', async () => {
    const { service, repo } = setup();
    const result = await service.rotateSecret(TENANT, ID);
    expect(result.secret).toMatch(/^whsec_/);
    expect(repo.update).toHaveBeenCalledWith(TENANT, ID, { secretEncrypted: expect.stringMatching(/^cifrado/) });
  });

  it('eliminar un endpoint inexistente o de otro tenant responde 404', async () => {
    const { service, repo } = setup();
    repo.update.mockResolvedValue(null);
    await expect(service.remove(TENANT, ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el evento de prueba crea una entrega webhook.prueba y la encola', async () => {
    const { service, repo, queue } = setup();
    const result = await service.sendTestEvent(TENANT, ID);
    expect(result).toEqual({ deliveryId: 'd-test', eventType: 'webhook.prueba', status: 'pending' });
    expect(repo.createTestDelivery).toHaveBeenCalledWith(
      TENANT,
      ID,
      expect.objectContaining({ eventName: 'webhook.prueba', tenantId: TENANT, version: 1 }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith({ deliveryId: 'd-test', attempt: 1 });
  });

  it('no envía eventos de prueba a endpoints desactivados', async () => {
    const { service, repo } = setup();
    repo.findById.mockResolvedValue(record({ isActive: false }));
    await expect(service.sendTestEvent(TENANT, ID)).rejects.toBeInstanceOf(ValidationError);
  });
});
