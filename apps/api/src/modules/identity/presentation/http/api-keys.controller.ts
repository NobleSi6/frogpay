import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GenerateApiKeyUseCase } from '../../application/use-cases/generate-api-key.use-case';
import { ListApiKeysUseCase } from '../../application/use-cases/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from '../../application/use-cases/revoke-api-key.use-case';
import { GenerateApiKeyDto } from '../../application/dto/generate-api-key.dto';
import { ApiKeyResponseDto, GeneratedApiKeyResponseDto } from '../../application/dto/api-key-response.dto';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { CurrentTenant } from '../../../../shared/auth/current-tenant.decorator';

type AuthenticatedRequest = Request & {
  user?: { role?: string; tenantId?: string };
};

@ApiTags('API Keys')
@ApiBearerAuth()
@ApiHeader({ name: 'x-user-role', description: 'Rol de desarrollo para probar en Swagger', required: true })
@Controller('tenants/:tenantId/api-keys')
@UseGuards(RolesGuard)
@Roles('PLATFORM_ADMIN', 'OWNER', 'ADMIN')
export class ApiKeysController {
  constructor(
    private readonly generateApiKey: GenerateApiKeyUseCase,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly revokeApiKey: RevokeApiKeyUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Generar una API key para un tenant' })
  @ApiParam({ name: 'tenantId', description: 'UUID del tenant' })
  @ApiResponse({ status: 201, description: 'Key creada; rawKey se devuelve una sola vez', type: GeneratedApiKeyResponseDto })
  create(
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
    return this.generateApiKey.execute(tenantId, dto);
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
  revoke(
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
    return this.revokeApiKey.execute(tenantId, apiKeyId);
  }
}

function getRequestRole(request: AuthenticatedRequest): string | undefined {
  if (request.user?.role) return request.user.role;
  if (process.env.NODE_ENV !== 'production') {
    const developmentRole = request.headers['x-user-role'];
    return Array.isArray(developmentRole) ? developmentRole[0] : developmentRole;
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
    throw new UnauthorizedException('No se encontró el contexto del tenant en la solicitud');
  }
  throw new UnauthorizedException('No se encontró un rol autorizado en la solicitud');
}
