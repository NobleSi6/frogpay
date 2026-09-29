import { ConfigService } from '@nestjs/config';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';
import { EventCatalog } from '../../../../shared/events/event-catalog';
import { TenantCreatedEvent } from '../../../identity/domain/events/tenant-created.event';
import { User } from '../../../identity/domain/entities/user.entity';
import { TenantCreatedEmailHandler } from './tenant-created-email.handler';

describe('TenantCreatedEmailHandler', () => {
  const owner = User.createInvitedOwner(
    '00000000-0000-4000-8000-000000000001',
    'owner@example.test',
  );
  const event = new TenantCreatedEvent({
    tenantId: owner.tenantId,
    name: 'Demo Ltd',
    taxId: '12345678',
    contactEmail: owner.email.value,
    plan: 'free',
    status: 'active',
    owner: {
      userId: owner.id,
      email: owner.email.value,
      role: owner.role,
      status: owner.status,
    },
    apiKeys: [],
  });

  it('subscribes to tenant.created', () => {
    const eventBus = { subscribe: jest.fn() };
    const handler = createHandler({ eventBus });

    handler.onModuleInit();

    expect(eventBus.subscribe).toHaveBeenCalledWith(EventCatalog.TENANT_CREADO, handler);
  });

  it('stores only a token hash and retries the email before acknowledging', async () => {
    const invitationOwner = User.createInvitedOwner(owner.tenantId, owner.email.value);
    const userRepository = {
      findById: jest.fn().mockResolvedValue(invitationOwner),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const emailSender = {
      sendInvitation: jest.fn()
        .mockRejectedValueOnce(new Error('temporary provider failure'))
        .mockResolvedValueOnce(undefined),
    };
    const handler = createHandler({ userRepository, emailSender });

    await handler.handle(event);

    expect(userRepository.save).toHaveBeenCalledTimes(1);
    const tokenHash = invitationOwner.invitationTokenHash!;
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(emailSender.sendInvitation).toHaveBeenCalledTimes(2);
    const invitation = emailSender.sendInvitation.mock.calls[1][0];
    const token = new URL(invitation.invitationUrl).pathname.split('/').pop();
    expect(CryptoUtil.hashString(token!)).toBe(tokenHash);
    expect(JSON.stringify(event)).not.toContain(token);
  });

  it('throws after three failed delivery attempts so RabbitMQ can route the event to the DLQ', async () => {
    const userRepository = {
      findById: jest.fn().mockResolvedValue(User.createInvitedOwner(owner.tenantId, owner.email.value)),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const emailSender = { sendInvitation: jest.fn().mockRejectedValue(new Error('provider down')) };
    const handler = createHandler({ userRepository, emailSender });

    await expect(handler.handle(event)).rejects.toThrow('provider down');
    expect(emailSender.sendInvitation).toHaveBeenCalledTimes(3);
  });
});

function createHandler(overrides: Record<string, unknown> = {}): TenantCreatedEmailHandler {
  return new TenantCreatedEmailHandler(
    { subscribe: jest.fn(), ...((overrides.eventBus as object) ?? {}) } as never,
    {
      findById: jest.fn().mockResolvedValue(ownerForDefault()),
      save: jest.fn().mockResolvedValue(undefined),
      ...((overrides.userRepository as object) ?? {}),
    } as never,
    {
      sendInvitation: jest.fn().mockResolvedValue(undefined),
      ...((overrides.emailSender as object) ?? {}),
    } as never,
    { get: jest.fn().mockReturnValue('http://localhost:3000'), ...((overrides.config as object) ?? {}) } as unknown as ConfigService,
  );
}

function ownerForDefault(): User {
  return User.createInvitedOwner('00000000-0000-4000-8000-000000000001', 'owner@example.test');
}