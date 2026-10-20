import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { AuditService } from '../../../audit/application/audit.service';

type RequestWithId = Request & { requestId?: string };

@ApiTags('Dashboard BFF - Webhooks (TSK-DEV2-303)')
@ApiBearerAuth()
@Controller('dashboard/webhooks')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class WebhookEndpointsController {
  constructor(
    private readonly service: WebhookEndpointsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Registrar un endpoint. El secreto de firma solo se devuelve en esta respuesta.',
  })
  @ApiResponse({ status: 201, type: WebhookEndpointWithSecretResponseDto })
  @ApiResponse({
    status: 422,
    description:
      'URL inválida (HTTPS obligatorio en producción) o eventos no permitidos',
  })
  async create(
    @CurrentTenantContext() ctx: AuthenticatedTenantContext,
    @Body() dto: CreateWebhookEndpointDto,
    @Req() request: RequestWithId,
  ) {
    const result = await this.service.create(ctx.tenantId, dto);
    await this.auditWebhook(
      ctx,
      request,
      result.id,
      'webhook.creado',
      result.environment,
    );
    return result;
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
  @ApiResponse({
    status: 404,
    description: 'No existe o pertenece a otro tenant',
  })
  get(
    @CurrentTenantContext() ctx: AuthenticatedTenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(ctx.tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar URL, eventos o activar/desactivar el endpoint',
  })
  @ApiResponse({ status: 200, type: WebhookEndpointResponseDto })
  async update(
    @CurrentTenantContext() ctx: AuthenticatedTenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookEndpointDto,
    @Req() request: RequestWithId,
  ) {
    const result = await this.service.update(ctx.tenantId, id, dto);
    await this.auditWebhook(
      ctx,
      request,
      id,
      'webhook.actualizado',
      result.environment,
    );
    return result;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un endpoint (borrado lógico; el historial se conserva)',
  })
  @ApiResponse({ status: 204 })
  async remove(
    @CurrentTenantContext() ctx: AuthenticatedTenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithId,
  ) {
    await this.service.remove(ctx.tenantId, id);
    await this.auditWebhook(
      ctx,
      request,
      id,
      'webhook.eliminado',
      'production',
    );
  }

  @Post(':id/rotate-secret')
  @ApiOperation({
    summary:
      'Rotar el secreto de firma. El nuevo secreto solo se devuelve en esta respuesta.',
  })
  @ApiResponse({ status: 201, type: WebhookEndpointWithSecretResponseDto })
  async rotateSecret(
    @CurrentTenantContext() ctx: AuthenticatedTenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.service.rotateSecret(ctx.tenantId, id);
    await this.auditWebhook(
      ctx,
      request,
      id,
      'webhook.secret.rotado',
      result.environment,
    );
    return result;
  }

  @Post(':id/test')
  @ApiOperation({
    summary: 'Enviar un evento de prueba (webhook.prueba) firmado al endpoint',
  })
  @ApiResponse({ status: 201, type: TestEventResponseDto })
  sendTest(
    @CurrentTenantContext() ctx: AuthenticatedTenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.sendTestEvent(ctx.tenantId, id);
  }

  private auditWebhook(
    ctx: AuthenticatedTenantContext,
    request: RequestWithId,
    entityId: string,
    action: string,
    environment: 'sandbox' | 'production',
  ) {
    return (
      this.audit?.append({
        eventId: randomUUID(),
        tenantId: ctx.tenantId,
        entity: 'webhook',
        entityId,
        action,
        actor: { type: 'user', id: ctx.userId, role: ctx.role },
        actorUserId: ctx.userId,
        requestId: request.requestId,
        environment,
        occurredAt: new Date(),
      }) ?? Promise.resolve({ id: entityId, duplicate: false })
    );
  }
}
