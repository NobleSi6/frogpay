import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WEBHOOK_SUBSCRIBABLE_EVENTS } from '../../domain/webhook-envelope';

const EVENTS = [...WEBHOOK_SUBSCRIBABLE_EVENTS];

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'https://mi-tienda.com/webhooks/frogpay' })
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  url!: string;

  @ApiProperty({ enum: EVENTS, isArray: true, example: ['pago.aprobado', 'pago.rechazado'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un evento.' })
  @ArrayUnique()
  @IsIn(EVENTS, { each: true, message: `Eventos permitidos: ${EVENTS.join(', ')}.` })
  eventTypes!: string[];

  @ApiPropertyOptional({ enum: ['sandbox', 'production'], default: 'sandbox' })
  @IsOptional()
  @IsIn(['sandbox', 'production'])
  environment?: 'sandbox' | 'production';
}

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional({ example: 'https://mi-tienda.com/webhooks/frogpay' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  url?: string;

  @ApiPropertyOptional({ enum: EVENTS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un evento.' })
  @ArrayUnique()
  @IsIn(EVENTS, { each: true, message: `Eventos permitidos: ${EVENTS.join(', ')}.` })
  eventTypes?: string[];

  @ApiPropertyOptional({ example: true, description: 'Activar o desactivar el endpoint' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class WebhookEndpointResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() url: string;
  @ApiProperty({ enum: EVENTS, isArray: true }) eventTypes: string[];
  @ApiProperty() isActive: boolean;
  @ApiProperty({ enum: ['sandbox', 'production'] }) environment: 'sandbox' | 'production';
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

export class WebhookEndpointWithSecretResponseDto extends WebhookEndpointResponseDto {
  @ApiProperty({
    example: 'whsec_...',
    description: 'Secreto de firma. Solo se devuelve en esta respuesta: guárdalo ahora, no se vuelve a mostrar.',
  })
  secret: string;
}

export class TestEventResponseDto {
  @ApiProperty() deliveryId!: string;
  @ApiProperty({ example: 'webhook.prueba' }) eventType!: string;
  @ApiProperty({ example: 'pending' }) status!: string;
}

export class WebhookDeliveryResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) webhookId: string;
  @ApiProperty({ example: 'https://mi-tienda.com/webhooks/frogpay' }) webhookUrl: string;
  @ApiProperty({ format: 'uuid', nullable: true }) paymentId: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) eventId: string | null;
  @ApiProperty() eventType: string;
  @ApiProperty({ enum: ['pending', 'delivered', 'failed'] }) status: string;
  @ApiProperty() attemptCount: number;
  @ApiProperty({ nullable: true }) responseCode: number | null;
  @ApiProperty({ nullable: true }) lastError: string | null;
  @ApiProperty({ nullable: true }) nextRetryAt: string | null;
  @ApiProperty({ nullable: true }) deliveredAt: string | null;
  @ApiProperty() createdAt: string;
}

export class WebhookDeliveryAttemptDto {
  @ApiProperty() attemptNumber!: number;
  @ApiProperty({ nullable: true }) responseCode!: number | null;
  @ApiProperty({ nullable: true }) error!: string | null;
  @ApiProperty() durationMs!: number;
  @ApiProperty() succeeded!: boolean;
  @ApiProperty() createdAt!: string;
}

export class WebhookDeliveryDetailResponseDto extends WebhookDeliveryResponseDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) payload: Record<string, unknown>;
  @ApiProperty({ type: [WebhookDeliveryAttemptDto] }) attempts: WebhookDeliveryAttemptDto[];
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
  @IsIn(['pending', 'delivered', 'failed'])
  status?: 'pending' | 'delivered' | 'failed';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  webhookId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
