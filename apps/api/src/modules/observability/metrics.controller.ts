import {
  Controller,
  Get,
  Header,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../shared/auth/public.decorator';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  async getMetrics(
    @Res() response: Response,
  ): Promise<void> {
    const metrics =
      await this.metricsService.getMetrics();

    response
      .status(200)
      .type(this.metricsService.getContentType())
      .send(metrics);
  }
}
