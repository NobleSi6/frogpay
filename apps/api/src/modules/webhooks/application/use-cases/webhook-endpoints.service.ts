import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateWebhookEndpointDto, UpdateWebhookEndpointDto } from '../dto/webhook-endpoint.dto';

@Injectable()
export class WebhookEndpointsService {
  async create(tenantId: string, dto: CreateWebhookEndpointDto) {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId,
      url: dto.url,
      eventTypes: dto.eventTypes,
      isActive: true,
      environment: dto.environment ?? 'sandbox',
      createdAt: new Date(),
      secret: 'whsec_test_secret',
    };
  }

  async list(tenantId: string) {
    return [];
  }

  async get(tenantId: string, id: string) {
    if (!id) throw new NotFoundException('Webhook endpoint not found');
    return {
      id,
      tenantId,
      url: 'https://mi-tienda.com/webhooks/frogpay',
      eventTypes: ['pago.aprobado'],
      isActive: true,
      environment: 'sandbox',
      createdAt: new Date(),
    };
  }

  async update(tenantId: string, id: string, dto: UpdateWebhookEndpointDto) {
    return {
      id,
      tenantId,
      url: dto.url ?? 'https://mi-tienda.com/webhooks/frogpay',
      eventTypes: dto.eventTypes ?? ['pago.aprobado'],
      isActive: dto.isActive ?? true,
      environment: dto.environment ?? 'sandbox',
      createdAt: new Date(),
    };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    return;
  }

  async rotateSecret(tenantId: string, id: string) {
    return {
      id,
      tenantId,
      url: 'https://mi-tienda.com/webhooks/frogpay',
      eventTypes: ['pago.aprobado'],
      isActive: true,
      environment: 'sandbox',
      createdAt: new Date(),
      secret: 'whsec_rotated_secret',
    };
  }

  async sendTestEvent(tenantId: string, id: string) {
    return {
      accepted: true,
      status: 'queued',
      deliveryId: '33333333-3333-4333-8333-333333333333',
    };
  }
}
