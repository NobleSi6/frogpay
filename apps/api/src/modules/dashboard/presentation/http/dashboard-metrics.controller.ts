import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../../shared/auth/current-tenant.decorator';
import { Roles } from '../../../../shared/auth/roles.decorator';
import { DashboardMetricsService } from '../../application/dashboard-metrics.service';
import { DashboardMetricsQueryDto } from '../dto/dashboard-metrics-query.dto';

@ApiTags('Dashboard - Métricas')
@ApiBearerAuth()
@Controller('dashboard/metrics')
@Roles('OWNER', 'OPERATOR', 'VIEWER')
export class DashboardMetricsController {
  constructor(private readonly metrics: DashboardMetricsService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener métricas agregadas del tenant para 7 o 30 días',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas separadas por tenant y ambiente.',
  })
  get(@CurrentTenant() tenantId: string, @Query() query: DashboardMetricsQueryDto) {
    return this.metrics.get(tenantId, query.days, query.environment);
  }
}
