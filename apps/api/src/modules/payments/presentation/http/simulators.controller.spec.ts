import { ForbiddenException } from '@nestjs/common';
import { SimulatorsController } from './simulators.controller';
import type { BankReconciliationService } from '../../application/services/bank-reconciliation.service';
import type { BankDepositSimulationDto } from '../../application/dto/bank-deposit-simulation.dto';

describe('SimulatorsController', () => {
  let controller: SimulatorsController;
  let bankReconciliationService: jest.Mocked<BankReconciliationService>;

  beforeEach(() => {
    bankReconciliationService = {
      reconcile: jest.fn(),
    } as unknown as jest.Mocked<BankReconciliationService>;

    controller = new SimulatorsController(bankReconciliationService);
  });

  const dto: BankDepositSimulationDto = {
    reference: 'BT-2026-A81F92',
    amount: '150.00',
    currency: 'BOB',
    bankName: 'Banco de Prueba',
    depositId: 'DEP-12345',
  };

  it('debe rechazar con ForbiddenException (403) si el ambiente es production', async () => {
    const req: any = {
      apiKeyContext: {
        tenantId: 'tenant-1',
        environment: 'production',
        apiKeyId: 'key-prod',
        keyPrefix: 'prod_123',
      },
    };

    await expect(controller.simulateBankDeposit(req, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(bankReconciliationService.reconcile).not.toHaveBeenCalled();
  });

  it('debe procesar el depósito si el ambiente es sandbox', async () => {
    const req: any = {
      apiKeyContext: {
        tenantId: 'tenant-1',
        environment: 'sandbox',
        apiKeyId: 'key-sbx',
        keyPrefix: 'sbx_123',
      },
    };

    bankReconciliationService.reconcile.mockResolvedValue({
      status: 'reconciled',
      depositId: 'dep-uuid-1',
      paymentId: 'pay-uuid-1',
    });

    const result = await controller.simulateBankDeposit(req, dto);

    expect(result.status).toBe('reconciled');
    expect(result.depositId).toBe('dep-uuid-1');
    expect(result.paymentId).toBe('pay-uuid-1');

    expect(bankReconciliationService.reconcile).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      depositId: 'DEP-12345',
      reference: 'BT-2026-A81F92',
      amount: '150.00',
      currency: 'BOB',
      bankName: 'Banco de Prueba',
    });
  });
});
