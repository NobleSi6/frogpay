import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaTenantContextService } from '../../../../shared/database/prisma-tenant-context.service';
import type { PaymentSettlementService } from './payment-settlement.service';
import { PaymentQrExpirationJob } from './payment-qr-expiration.job';

describe('PaymentQrExpirationJob', () => {
  let job: PaymentQrExpirationJob;
  let findMany: jest.Mock;
  let withGlobalAccess: jest.Mock;
  let reject: jest.Mock;
  let config: jest.Mocked<Pick<ConfigService, 'get' | 'getOrThrow'>>;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    withGlobalAccess = jest.fn(async (callback: (tx: never) => Promise<unknown>) =>
      callback({ payment: { findMany } } as never),
    );
    reject = jest.fn().mockResolvedValue({ outcome: 'changed' });
    config = {
      get: jest.fn().mockReturnValue(true),
      getOrThrow: jest.fn().mockReturnValue(30),
    };
    job = new PaymentQrExpirationJob(
      { withGlobalAccess } as unknown as PrismaTenantContextService,
      { reject } as unknown as PaymentSettlementService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    job.onModuleDestroy();
    jest.useRealTimers();
  });

  it('expires selected pending rows one at a time with qr_expired', async () => {
    findMany.mockResolvedValue([{ id: 'payment-1' }, { id: 'payment-2' }]);

    await job.runOnce();

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'pending', expires_at: { lte: expect.any(Date) } },
      orderBy: { expires_at: 'asc' },
      select: { id: true },
      take: 100,
    });
    expect(reject.mock.calls).toEqual([
      ['payment-1', 'qr_expired'],
      ['payment-2', 'qr_expired'],
    ]);
  });

  it('does not reject when there are no expired payments', async () => {
    await job.runOnce();
    expect(reject).not.toHaveBeenCalled();
  });

  it('continues processing after an individual settlement failure', async () => {
    findMany.mockResolvedValue([{ id: 'payment-failing' }, { id: 'payment-next' }]);
    reject
      .mockRejectedValueOnce(new Error('settlement failed'))
      .mockResolvedValueOnce({ outcome: 'changed' });
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(job.runOnce()).resolves.toBeUndefined();

    expect(reject).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo expirar el pago QR payment-failing: settlement failed'),
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
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('QR_EXPIRATION_JOB_ENABLED=false'));
    warning.mockRestore();
  });

  it('uses the configured interval when enabled', () => {
    jest.useFakeTimers();
    job.onApplicationBootstrap();

    expect(jest.getTimerCount()).toBe(1);
    job.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
