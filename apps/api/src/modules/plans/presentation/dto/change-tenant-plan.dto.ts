import { IsUUID } from 'class-validator';

export class ChangeTenantPlanDto {
  @IsUUID('all', { message: 'planId debe ser un UUID válido.' })
  planId!: string;
}