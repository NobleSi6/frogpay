import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import {
  ListDeliveriesQueryDto,
  PaginatedWebhookDeliveriesDto,
  WebhookDeliveryDetailResponseDto,
  WebhookDeliveryResponseDto,
} from '../../application/dto/webhook-endpoint.dto';
import { WebhookDeliveriesService } from '../../application/use-cases/webhook-deliveries.service';

@ApiTags('Dashboard BFF - Webhooks (TSK-DEV2-303)')
@ApiBearerAuth()
@Controller('dashboard/webhook-deliveries')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class WebhookDeliveriesController {
  constructor(private readonly service: WebhookDeliveriesService) {}

  @Get()
  @ApiOperation({ summary: 'Historial de entregas paginado, con filtros por estado, pago y endpoint' })
  @ApiResponse({ status: 200, type: PaginatedWebhookDeliveriesDto })
  list(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Query() query: ListDeliveriesQueryDto) {
    return this.service.list(ctx.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una entrega: payload enviado e historial de intentos' })
  @ApiResponse({ status: 200, type: WebhookDeliveryDetailResponseDto })
  get(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(ctx.tenantId, id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Reenviar manualmente una entrega fallida' })
  @ApiResponse({ status: 201, type: WebhookDeliveryResponseDto })
  @ApiResponse({ status: 409, description: 'invalid_state_transition: la entrega no está en estado fallido' })
  retry(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retry(ctx.tenantId, id);
  }
}
