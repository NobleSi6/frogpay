import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export const WEBHOOK_EVENTS = ['pago.creado', 'pago.aprobado', 'pago.rechazado', 'webhook.prueba'] as const;

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'https://mi-tienda.com/webhooks/frogpay' })
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  url: string;

  @ApiProperty({ type: [String], example: ['pago.aprobado', 'pago.rechazado'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  eventTypes: string[];

  @ApiPropertyOptional({ enum: ['sandbox', 'production'], default: 'sandbox' })
  @IsOptional()
  @IsEnum(['sandbox', 'production'])
  environment?: 'sandbox' | 'production';
}

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional({ example: 'https://mi-tienda.com/webhooks/frogpay' })
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  url?: string;

  @ApiPropertyOptional({ type: [String], example: ['pago.aprobado'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  eventTypes?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: ['sandbox', 'production'] })
  @IsOptional()
  @IsEnum(['sandbox', 'production'])
  environment?: 'sandbox' | 'production';
}

export class WebhookEndpointResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) tenantId: string;
  @ApiProperty() url: string;
  @ApiProperty({ type: [String] }) eventTypes: string[];
  @ApiProperty() isActive: boolean;
  @ApiProperty({ enum: ['sandbox', 'production'] }) environment: 'sandbox' | 'production';
  @ApiProperty() createdAt: Date;
}

export class WebhookEndpointWithSecretResponseDto extends WebhookEndpointResponseDto {
  @ApiProperty() secret: string;
}

export class TestEventResponseDto {
  @ApiProperty({ example: true }) accepted: boolean;
  @ApiProperty({ example: 'queued' }) status: 'queued' | 'sent';
  @ApiPropertyOptional({ format: 'uuid' }) deliveryId?: string;
}

export class WebhookDeliveryResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) webhookId: string;
  @ApiProperty({ format: 'uuid', nullable: true }) paymentId: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) eventId: string | null;
  @ApiProperty() eventType: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) responseCode: number | null;
  @ApiProperty({ nullable: true }) lastError: string | null;
  @ApiProperty({ nullable: true }) nextRetryAt: Date | null;
  @ApiProperty({ nullable: true }) deliveredAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() attemptCount: number;
}

export class WebhookDeliveryDetailResponseDto extends WebhookDeliveryResponseDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) payload: Record<string, unknown>;
  @ApiProperty({ type: [Object] }) attempts: Array<Record<string, unknown>>;
}

export class PaginatedWebhookDeliveriesDto {
  @ApiProperty({ type: [WebhookDeliveryResponseDto] }) data: WebhookDeliveryResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class ListDeliveriesQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'failed', 'delivered'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  pageSize?: number;
}
