import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import {
  CreateWebhookEndpointDto,
  TestEventResponseDto,
  UpdateWebhookEndpointDto,
  WebhookEndpointResponseDto,
  WebhookEndpointWithSecretResponseDto,
} from '../../application/dto/webhook-endpoint.dto';
import { WebhookEndpointsService } from '../../application/use-cases/webhook-endpoints.service';

@ApiTags('Dashboard BFF - Webhooks (TSK-DEV2-303)')
@ApiBearerAuth()
@Controller('dashboard/webhooks')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class WebhookEndpointsController {
  constructor(private readonly service: WebhookEndpointsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un endpoint. El secreto de firma solo se devuelve en esta respuesta.' })
  @ApiResponse({ status: 201, type: WebhookEndpointWithSecretResponseDto })
  @ApiResponse({ status: 422, description: 'URL inválida (HTTPS obligatorio en producción) o eventos no permitidos' })
  create(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Body() dto: CreateWebhookEndpointDto) {
    return this.service.create(ctx.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar los endpoints del tenant (sin secretos)' })
  @ApiResponse({ status: 200, type: [WebhookEndpointResponseDto] })
  list(@CurrentTenantContext() ctx: AuthenticatedTenantContext) {
    return this.service.list(ctx.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un endpoint' })
  @ApiResponse({ status: 200, type: WebhookEndpointResponseDto })
  @ApiResponse({ status: 404, description: 'No existe o pertenece a otro tenant' })
  get(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(ctx.tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar URL, eventos o activar/desactivar el endpoint' })
  @ApiResponse({ status: 200, type: WebhookEndpointResponseDto })
  update(
    @CurrentTenantContext() ctx: AuthenticatedTenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.service.update(ctx.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar un endpoint (borrado lógico; el historial se conserva)' })
  @ApiResponse({ status: 204 })
  async remove(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(ctx.tenantId, id);
  }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotar el secreto de firma. El nuevo secreto solo se devuelve en esta respuesta.' })
  @ApiResponse({ status: 201, type: WebhookEndpointWithSecretResponseDto })
  rotateSecret(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.rotateSecret(ctx.tenantId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Enviar un evento de prueba (webhook.prueba) firmado al endpoint' })
  @ApiResponse({ status: 201, type: TestEventResponseDto })
  sendTest(@CurrentTenantContext() ctx: AuthenticatedTenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.sendTestEvent(ctx.tenantId, id);
  }
}
