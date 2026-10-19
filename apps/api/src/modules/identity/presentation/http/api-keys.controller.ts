import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GenerateApiKeyUseCase } from '../../application/use-cases/generate-api-key.use-case';
import { ListApiKeysUseCase } from '../../application/use-cases/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../application/use-cases/revoke-api-key.use-case';
import { RegenerateApiKeyUseCase } from '../../application/use-cases/regenerate-api-key.use-case';
import { GenerateApiKeyDto } from '../../application/dto/generate-api-key.dto';
import {
  ApiKeyResponseDto,
  GeneratedApiKeyResponseDto,
} from '../../application/dto/api-key-response.dto';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { CurrentTenant } from '../../../../shared/auth/current-tenant.decorator';
import { AuditService } from '../../../audit/application/audit.service';
import { randomUUID } from 'node:crypto';

type AuthenticatedRequest = Request & {
  user?: { id?: string; role?: string; tenantId?: string };
  requestId?: string;
};

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('tenants/:tenantId/api-keys')
@UseGuards(RolesGuard)
@Roles('PLATFORM_ADMIN', 'OWNER', 'ADMIN')
export class ApiKeysController {
  constructor(
    private readonly generateApiKey: GenerateApiKeyUseCase,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly revokeApiKey: RevokeApiKeyUseCase,
    private readonly regenerateApiKey: RegenerateApiKeyUseCase,
    @Optional() private readonly audit?: AuditService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Generar una API key para un tenant' })
  @ApiParam({ name: 'tenantId', description: 'UUID del tenant' })
  @ApiResponse({
    status: 201,
    description: 'Key creada; rawKey se devuelve una sola vez',
    type: GeneratedApiKeyResponseDto,
  })
  async create(
    @Param('tenantId') routeTenantId: string,
    @CurrentTenant({ optional: true }) currentTenantId: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body() dto: GenerateApiKeyDto,
  ): Promise<GeneratedApiKeyResponseDto> {
    const tenantId = resolveApiKeyTenantId(
      getRequestRole(request),
      routeTenantId,
      currentTenantId,
    );
    const result = await this.generateApiKey.execute(tenantId, dto);
    await this.auditApiKey(request, tenantId, result.id, 'api_key.creada');
    return result;
  }

  @Post(':apiKeyId/regenerate')
  @ApiOperation({
    summary: 'Revocar una API key y generar su reemplazo de forma atómica',
  })
  async regenerate(
    @Param('tenantId') routeTenantId: string,
    @Param('apiKeyId') apiKeyId: string,
    @CurrentTenant({ optional: true }) currentTenantId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<GeneratedApiKeyResponseDto> {
    const tenantId = resolveApiKeyTenantId(
      getRequestRole(request),
      routeTenantId,
      currentTenantId,
    );
    const result = await this.regenerateApiKey.execute(tenantId, apiKeyId);
    await this.auditApiKey(request, tenantId, apiKeyId, 'api_key.regenerada');
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'Listar las API keys enmascaradas del tenant' })
  @ApiParam({ name: 'tenantId', description: 'UUID del tenant' })
  @ApiResponse({ status: 200, type: ApiKeyResponseDto, isArray: true })
  list(
    @Param('tenantId') routeTenantId: string,
    @CurrentTenant({ optional: true }) currentTenantId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiKeyResponseDto[]> {
    const tenantId = resolveApiKeyTenantId(
      getRequestRole(request),
      routeTenantId,
      currentTenantId,
    );
    return this.listApiKeys.execute(tenantId);
  }

  @Delete(':apiKeyId')
  @ApiOperation({ summary: 'Revocar una API key del tenant' })
  @ApiParam({ name: 'tenantId', description: 'UUID del tenant' })
  @ApiParam({ name: 'apiKeyId', description: 'UUID de la API key' })
  @ApiResponse({ status: 200, type: ApiKeyResponseDto })
  async revoke(
    @Param('tenantId') routeTenantId: string,
    @Param('apiKeyId') apiKeyId: string,
    @CurrentTenant({ optional: true }) currentTenantId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiKeyResponseDto> {
    const tenantId = resolveApiKeyTenantId(
      getRequestRole(request),
      routeTenantId,
      currentTenantId,
    );
    const result = await this.revokeApiKey.execute(tenantId, apiKeyId);
    await this.auditApiKey(request, tenantId, apiKeyId, 'api_key.revocada');
    return result;
  }

  private auditApiKey(
    request: AuthenticatedRequest,
    tenantId: string,
    entityId: string,
    action: string,
  ) {
    return (
      this.audit?.append({
        eventId: randomUUID(),
        tenantId,
        entity: 'api_key',
        entityId,
        action,
        actor: { type: 'user', id: request.user?.id, role: request.user?.role },
        actorUserId: request.user?.id,
        requestId: request.requestId,
        environment: 'production',
        occurredAt: new Date(),
      }) ?? Promise.resolve({ id: entityId, duplicate: false })
    );
  }
}

function getRequestRole(request: AuthenticatedRequest): string | undefined {
  if (request.user?.role) return request.user.role;
  if (process.env.NODE_ENV !== 'production') {
    const developmentRole = request.headers['x-user-role'];
    return Array.isArray(developmentRole)
      ? developmentRole[0]
      : developmentRole;
  }
  return undefined;
}

export function resolveApiKeyTenantId(
  role: string | undefined,
  routeTenantId: string,
  currentTenantId?: string,
): string {
  if (role === 'PLATFORM_ADMIN') return routeTenantId;
  if (role === 'OWNER' || role === 'ADMIN') {
    if (currentTenantId) return currentTenantId;
    throw new UnauthorizedException(
      'No se encontró el contexto del tenant en la solicitud',
    );
  }
  throw new UnauthorizedException(
    'No se encontró un rol autorizado en la solicitud',
  );
}
