import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../../../shared/http/errors/validation-error';
import { buildEnvelope, WEBHOOK_TEST_EVENT } from '../../domain/webhook-envelope';
import { generateWebhookSecret } from '../../domain/webhook-secret';
import { validateWebhookUrl, WebhookEnvironment } from '../../domain/webhook-url.policy';
import { WebhookDispatchQueue } from '../../infrastructure/messaging/webhook-dispatch.queue';
import {
  WebhookEndpointRecord,
  WebhookEndpointRepository,
} from '../../infrastructure/persistence/webhook-endpoint.repository';
import {
  CreateWebhookEndpointDto,
  TestEventResponseDto,
  UpdateWebhookEndpointDto,
  WebhookEndpointResponseDto,
  WebhookEndpointWithSecretResponseDto,
} from '../dto/webhook-endpoint.dto';
import { WEBHOOK_SECRET_CIPHER, WebhookSecretCipher } from '../ports/webhook-secret-cipher.port';

/**
 * Gestión de endpoints de webhooks del tenant (TSK-DEV2-303). El secreto en
 * claro solo existe en la respuesta de creación o rotación: se guarda cifrado
 * y nunca se escribe en logs.
 */
@Injectable()
export class WebhookEndpointsService {
  private readonly logger = new Logger(WebhookEndpointsService.name);

  constructor(
    private readonly endpoints: WebhookEndpointRepository,
    private readonly queue: WebhookDispatchQueue,
    @Inject(WEBHOOK_SECRET_CIPHER) private readonly cipher: WebhookSecretCipher,
  ) {}

  async create(tenantId: string, dto: CreateWebhookEndpointDto): Promise<WebhookEndpointWithSecretResponseDto> {
    const environment: WebhookEnvironment = dto.environment ?? 'sandbox';
    this.assertValidUrl(dto.url, environment);

    const secret = generateWebhookSecret();
    const record = await this.endpoints.create(tenantId, {
      url: dto.url,
      eventTypes: dto.eventTypes,
      environment,
      secretEncrypted: this.cipher.encrypt(secret),
    });
    this.logger.log(`Endpoint de webhook ${record.id} creado para el tenant ${tenantId} (${environment})`);
    return { ...toResponse(record), secret };
  }

  async list(tenantId: string): Promise<WebhookEndpointResponseDto[]> {
    return (await this.endpoints.list(tenantId)).map(toResponse);
  }

  async get(tenantId: string, id: string): Promise<WebhookEndpointResponseDto> {
    return toResponse(await this.findOrFail(tenantId, id));
  }

  async update(tenantId: string, id: string, dto: UpdateWebhookEndpointDto): Promise<WebhookEndpointResponseDto> {
    const current = await this.findOrFail(tenantId, id);
    if (dto.url !== undefined) this.assertValidUrl(dto.url, current.environment);
    const updated = await this.endpoints.update(tenantId, id, {
      url: dto.url,
      eventTypes: dto.eventTypes,
      isActive: dto.isActive,
    });
    return toResponse(updated ?? this.notFound());
  }

  /** Borrado lógico: el historial de entregas se conserva para auditoría. */
  async remove(tenantId: string, id: string): Promise<void> {
    const deleted = await this.endpoints.update(tenantId, id, { deleted: true });
    if (!deleted) this.notFound();
    this.logger.log(`Endpoint de webhook ${id} eliminado (tenant ${tenantId})`);
  }

  async rotateSecret(tenantId: string, id: string): Promise<WebhookEndpointWithSecretResponseDto> {
    const secret = generateWebhookSecret();
    const updated = await this.endpoints.update(tenantId, id, { secretEncrypted: this.cipher.encrypt(secret) });
    if (!updated) this.notFound();
    this.logger.log(`Secreto del endpoint ${id} rotado (tenant ${tenantId})`);
    return { ...toResponse(updated!), secret };
  }

  async sendTestEvent(tenantId: string, id: string): Promise<TestEventResponseDto> {
    const endpoint = await this.findOrFail(tenantId, id);
    if (!endpoint.isActive) {
      throw new ValidationError({ webhookId: 'El endpoint está desactivado; actívalo para enviar un evento de prueba.' });
    }
    const envelope = buildEnvelope({
      eventId: randomUUID(),
      eventName: WEBHOOK_TEST_EVENT,
      occurredOn: new Date(),
      tenantId,
      payload: {
        message: 'Evento de prueba de FrogPay. Si validas esta firma, tu integración está lista.',
        webhookId: endpoint.id,
        environment: endpoint.environment,
      },
    });
    const deliveryId = await this.endpoints.createTestDelivery(tenantId, endpoint.id, envelope);
    await this.queue.enqueue({ deliveryId, attempt: 1 });
    return { deliveryId, eventType: WEBHOOK_TEST_EVENT, status: 'pending' };
  }

  private assertValidUrl(url: string, environment: WebhookEnvironment): void {
    const reason = validateWebhookUrl(url, environment);
    if (reason) throw new ValidationError({ url: reason });
  }

  private async findOrFail(tenantId: string, id: string): Promise<WebhookEndpointRecord> {
    return (await this.endpoints.findById(tenantId, id)) ?? this.notFound();
  }

  private notFound(): never {
    throw new NotFoundException({ code: 'not_found', message: 'No existe un endpoint de webhook con ese identificador.' });
  }
}

function toResponse(record: WebhookEndpointRecord): WebhookEndpointResponseDto {
  return {
    id: record.id,
    url: record.url,
    eventTypes: record.eventTypes,
    environment: record.environment,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
