import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { CreateTenantDto } from '../../application/dto/create-tenant.dto';
import { TenantResponseDto } from '../../application/dto/tenant-response.dto';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(RolesGuard)
export class TenantsController {
  constructor(private readonly createTenantUseCase: CreateTenantUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({
    summary: 'Registrar una nueva empresa / tenant (HU-01 & TSK-DEV1-101)',
    description:
      'Crea una empresa/tenant, inicializa al usuario propietario en estado "invited" con token seguro (HU-01B), genera las llaves de API iniciales (Test y Live) almacenando únicamente su hash SHA-256 (RNF-05), y emite el evento de dominio "tenant.creado". Requiere rol PLATFORM_ADMIN (RNF-11).',
  })
  @ApiHeader({
    name: 'x-user-role',
    description: 'Header de rol para desarrollo/testing (e.g. PLATFORM_ADMIN)',
    required: false,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Tenant y credenciales iniciales creados exitosamente.',
    type: TenantResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de validación del DTO inválidos.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Acceso denegado: se requiere rol PLATFORM_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Conflicto: NIT, nombre de empresa o correo ya existen.',
  })
  async createTenant(@Body() createTenantDto: CreateTenantDto): Promise<TenantResponseDto> {
    return this.createTenantUseCase.execute(createTenantDto);
  }
}
