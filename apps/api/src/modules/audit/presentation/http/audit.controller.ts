import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { AuditService } from '../../application/audit.service';
import { AuditLogQueryDto, VerifyAuditQueryDto } from '../dto/audit-query.dto';

@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('dashboard/audit-logs')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Consultar el log de auditoría del tenant actual' })
  @ApiResponse({
    status: 200,
    description: 'Registros paginados, sin hashes ni secretos.',
  })
  list(@CurrentTenant() tenantId: string, @Query() query: AuditLogQueryDto) {
    return this.audit.list(tenantId, {
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  @Get('admin/audit/verify')
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({
    summary: 'Verificar la cadena de hashes de auditoría de un tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado y primera ruptura encontrada.',
  })
  @ApiResponse({
    status: 503,
    description:
      'La verificación no pudo acceder a la cadena. Revisa la conexión y las migraciones.',
    schema: {
      example: {
        code: 'audit_verification_unavailable',
        message:
          'No se pudo verificar la cadena de auditoría. Comprueba la conexión y las migraciones de la base de datos.',
        details: null,
        requestId: '8e9f...',
      },
    },
  })
  verify(@Query() query: VerifyAuditQueryDto) {
    return this.audit.verify(query.tenantId);
  }
}
