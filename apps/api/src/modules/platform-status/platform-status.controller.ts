import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../../shared/auth/roles.decorator';
import { PlatformStatusService } from './platform-status.service';

@ApiTags('Platform Status')
@ApiBearerAuth()
@Controller('admin/platform-status')
export class PlatformStatusController {
  constructor(
    private readonly platformStatus: PlatformStatusService,
  ) {}

  @Get()
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({
    summary: 'Consultar estado interno de FrogPay',
  })
  getStatus() {
    return this.platformStatus.getStatus();
  }
}
