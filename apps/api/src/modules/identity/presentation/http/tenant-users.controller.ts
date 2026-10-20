import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { InviteTenantUserDto, TenantUserResponseDto } from '../../application/dto/tenant-user.dto';
import { InviteTenantUserUseCase } from '../../application/use-cases/invite-tenant-user.use-case';
import { ListTenantUsersUseCase } from '../../application/use-cases/list-tenant-users.use-case';

@ApiTags('Usuarios del tenant')
@ApiBearerAuth()
@Controller('dashboard/users')
export class TenantUsersController {
  constructor(
    private readonly inviteUser: InviteTenantUserUseCase,
    private readonly listUsers: ListTenantUsersUseCase,
  ) {}

  @Get()
  @Roles('OWNER')
  @ApiOperation({ summary: 'Listar usuarios del tenant autenticado' })
  @ApiResponse({ status: 200, type: [TenantUserResponseDto] })
  list(@CurrentTenant() tenantId: string): Promise<TenantUserResponseDto[]> {
    return this.listUsers.execute(tenantId);
  }

  @Post('invitations')
  @Roles('OWNER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invitar un usuario al tenant autenticado' })
  @ApiResponse({ status: 201, type: TenantUserResponseDto })
  invite(
    @CurrentTenant() tenantId: string,
    @Body() dto: InviteTenantUserDto,
  ): Promise<TenantUserResponseDto> {
    return this.inviteUser.execute(tenantId, dto);
  }
}
