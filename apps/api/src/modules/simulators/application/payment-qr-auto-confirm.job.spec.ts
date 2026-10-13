import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaTenantContextService } from '../../../shared/database/prisma-tenant-context.service';
import type { PaymentSettlementService } from '../../payments/application/use-cases/payment-settlement.service';
import { PaymentQrAutoConfirmJob } from './payment-qr-auto-confirm.job';

describe('PaymentQrAutoConfirmJob', () => {
  let job: PaymentQrAutoConfirmJob;
  let findMany: jest.Mock;
  let withGlobalAccess: jest.Mock;
  let approve: jest.Mock;
  let config: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    withGlobalAccess = jest.fn(async (callback: (tx: never) => Promise<unknown>) =>
      callback({ payment: { findMany } } as never),
    );
    approve = jest.fn().mockResolvedValue({ outcome: 'changed' });
    config = {
      get: jest.fn().mockReturnValue(true),
      getOrThrow: jest.fn((key: string) =>
        key === 'qrAutoConfirmSeconds' ? 10 : 2,
      ),
    };
    job = new PaymentQrAutoConfirmJob(
      { withGlobalAccess } as unknown as PrismaTenantContextService,
      { approve } as unknown as PaymentSettlementService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    job.onModuleDestroy();
    jest.useRealTimers();
  });

  it('selects only mature, unexpired sandbox QR payments and settles one by one', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-11T20:00:00.000Z'));
    findMany.mockResolvedValue([{ id: 'payment-1' }, { id: 'payment-2' }]);
    const now = Date.now();

    await job.runOnce();

    const query = findMany.mock.calls[0]?.[0];
    expect(query.where).toMatchObject({
      status: 'pending',
      environment: 'sandbox',
      qr_payload: { not: null },
      provider: { is: { payment_method: { is: { code: 'qr' } } } },
    });
    // Allow 1ms tolerance for race condition between Date.now() capture and query execution
    expect(query.where.created_at.lte.getTime()).toBeLessThanOrEqual(before - 10_000 + 1);
    expect(query.where.expires_at.gt).toBeInstanceOf(Date);
    expect(query.orderBy).toEqual({ created_at: 'asc' });
    expect(query.take).toBe(100);
    expect(approve.mock.calls).toEqual([['payment-1'], ['payment-2']]);
  });

  it('continues processing if settlement of one payment fails', async () => {
    findMany.mockResolvedValue([{ id: 'payment-failing' }, { id: 'payment-next' }]);
    approve
      .mockRejectedValueOnce(new Error('settlement failed'))
      .mockResolvedValueOnce({ outcome: 'changed' });
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(job.runOnce()).resolves.toBeUndefined();

    expect(approve).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo autoconfirmar el pago QR payment-failing: settlement failed'),
    );
    error.mockRestore();
  });

  it('does not query or start a timer while disabled', async () => {
    config.get.mockReturnValue(false);
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.useFakeTimers();

    job.onApplicationBootstrap();
    await job.runOnce();

    expect(jest.getTimerCount()).toBe(0);
    expect(withGlobalAccess).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('QR_AUTO_CONFIRM_ENABLED=false'),
    );
    warning.mockRestore();
  });

  it('uses the configured interval and clears the timer', () => {
    jest.useFakeTimers();
    job.onApplicationBootstrap();

    expect(jest.getTimerCount()).toBe(1);
    job.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
