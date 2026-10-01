import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../shared/auth/public.decorator';
import { ActivateInvitationDto } from '../../application/dto/activate-invitation.dto';
import { ActivateInvitationUseCase } from '../../application/use-cases/activate-invitation.use-case';
import { LoginDto, LoginResponseDto, AuthenticatedUserDto } from '../../application/dto/login.dto';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { GetCurrentUserUseCase } from '../../application/use-cases/get-current-user.use-case';
import type { AuthenticatedUser } from '../../../../shared/auth/auth.types';

@ApiTags('Identity')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly activateInvitation: ActivateInvitationUseCase,
    private readonly loginUser: LoginUseCase,
    private readonly currentUser: GetCurrentUserUseCase,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con email y contraseña' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.loginUser.execute(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Obtener el usuario de la sesión actual' })
  me(@Req() request: Request & { user: AuthenticatedUser }): Promise<AuthenticatedUserDto> {
    return this.currentUser.execute(request.user);
  }

  @Post('activate-invitation')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Definir contraseña y activar una cuenta invitada' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cuenta activada' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invitación inválida, expirada o usada' })
  activate(@Body() dto: ActivateInvitationDto): Promise<{ message: string }> {
    return this.activateInvitation.execute(dto);
  }
}
