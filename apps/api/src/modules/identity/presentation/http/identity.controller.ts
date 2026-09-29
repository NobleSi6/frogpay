import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../shared/auth/public.decorator';
import { ActivateInvitationDto } from '../../application/dto/activate-invitation.dto';
import { ActivateInvitationUseCase } from '../../application/use-cases/activate-invitation.use-case';

@ApiTags('Identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly activateInvitation: ActivateInvitationUseCase) {}

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
