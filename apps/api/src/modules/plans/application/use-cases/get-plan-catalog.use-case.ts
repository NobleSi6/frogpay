import { Inject, Injectable } from '@nestjs/common';
import type { Plan } from '../../domain/entities/plan.entity.js';
import { PLAN_REPOSITORY } from '../../domain/repositories/plan.repository.js';
import type { PlanRepository } from '../../domain/repositories/plan.repository.js';

@Injectable()
export class GetPlanCatalogUseCase {
  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: PlanRepository,
  ) {}

  execute(): Promise<Plan[]> {
    return this.plans.findCatalog();
  }
}