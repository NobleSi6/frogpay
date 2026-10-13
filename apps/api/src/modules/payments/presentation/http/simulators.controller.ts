import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import type { ApiKeyContext } from '../guards/api-key-auth.guard';
import { BankReconciliationService } from '../../application/services/bank-reconciliation.service';
import {
  BankDepositSimulationDto,
  BankDepositSimulationResponseDto,
} from '../../application/dto/bank-deposit-simulation.dto';
import { PaymentErrorResponseDto } from '../../application/dto/payment-error.dto';

interface RequestWithApiKeyContext extends Request {
  apiKeyContext?: ApiKeyContext;
  tenantId?: string;
}

@ApiTags('Simuladores Sandbox (TSK-BANK-303)')
@Controller('v1/test/simulators')
export class SimulatorsController {
  constructor(
    private readonly bankReconciliationService: BankReconciliationService,
  ) {}

  @Post('bank-deposit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyAuthGuard)
  @ApiOperation({
    summary:
      'Simular depósito bancario para conciliación automática (TSK-BANK-303)',
    description:
      'Disponible exclusivamente en ambiente sandbox. Procesa el depósito recibido y concilia el pago asociado por referencia y monto exacto.',
  })
  @ApiHeader({
    name: 'X-Api-Key',
    description: 'API Key del tenant (debe ser de ambiente sandbox)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Depósito procesado y resultado de conciliación devuelto.',
    type: BankDepositSimulationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Prohibido en ambiente de producción.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Transición de estado inválida.',
    type: PaymentErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'El identificador del depósito ya se usó con datos diferentes.',
    type: PaymentErrorResponseDto,
  })
  async simulateBankDeposit(
    @Req() req: RequestWithApiKeyContext,
    @Body() dto: BankDepositSimulationDto,
  ): Promise<BankDepositSimulationResponseDto> {
    const apiKeyContext = req.apiKeyContext;

    if (!apiKeyContext || apiKeyContext.environment !== 'sandbox') {
      throw new ForbiddenException({
        code: 'forbidden_in_production',
        message: 'Los simuladores solo están disponibles en ambiente sandbox.',
      });
    }

    const result = await this.bankReconciliationService.reconcile({
      tenantId: apiKeyContext.tenantId,
      depositId: dto.depositId,
      reference: dto.reference,
      amount: dto.amount,
      currency: dto.currency,
      bankName: dto.bankName,
    });

    return {
      status: result.status,
      depositId: result.depositId,
      paymentId: result.paymentId,
      errorCode: result.errorCode,
    };
  }
}
