import { Controller, Get } from '@nestjs/common';
import { GetPlanCatalogUseCase } from '../../application/use-cases/get-plan-catalog.use-case.js';

@Controller('plans')
export class PlansController {
  constructor(private readonly getPlanCatalog: GetPlanCatalogUseCase) {}

  @Get()
  getCatalog() {
    return this.getPlanCatalog.execute();
  }
}