import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { CreateTenantDto } from '../../application/dto/create-tenant.dto';
import { TenantResponseDto } from '../../application/dto/tenant-response.dto';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { RolesGuard } from '../../../../shared/auth/roles.guard';
import { ListTenantsUseCase } from '../../application/use-cases/list-tenants.use-case';
import { TenantListResponseDto } from '../../application/dto/tenant-list-response.dto';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(RolesGuard)
export class TenantsController {
  constructor(
    private readonly createTenantUseCase: CreateTenantUseCase,
    private readonly listTenantsUseCase: ListTenantsUseCase,
  ) {}

  @Get()
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Listar tenants para Platform Admin' })
  listTenants(): Promise<TenantListResponseDto[]> {
    return this.listTenantsUseCase.execute();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({
    summary: 'Registrar una nueva empresa / tenant (HU-01 & TSK-DEV1-101)',
    description:
      'Crea una empresa/tenant, inicializa al usuario propietario en estado "invited" con token seguro (HU-01B), genera las llaves de API iniciales (Test y Live) almacenando únicamente su hash SHA-256 (RNF-05), y emite el evento de dominio "tenant.creado". Requiere rol PLATFORM_ADMIN (RNF-11).',
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
