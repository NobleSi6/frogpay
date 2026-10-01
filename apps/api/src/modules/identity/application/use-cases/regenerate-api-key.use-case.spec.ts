import { ApiKey } from '../../domain/entities/api-key.entity';
import { RegenerateApiKeyUseCase } from './regenerate-api-key.use-case';

describe('RegenerateApiKeyUseCase', () => {
  it('revokes the current key and persists the replacement atomically', async () => {
    const current = ApiKey.create({ tenantId: '00000000-0000-4000-8000-000000000001', name: 'Test', type: 'test', keyPrefix: 'fp_test_old', keyHash: 'old-hash', maskedKey: 'fp_test_old...0000' });
    const repository = { findById: jest.fn().mockResolvedValue(current), saveMany: jest.fn().mockResolvedValue(undefined) };
    const result = await new RegenerateApiKeyUseCase(repository as never).execute(current.tenantId, current.id);
    expect(repository.saveMany).toHaveBeenCalledTimes(1);
    const [revoked, replacement] = repository.saveMany.mock.calls[0][0];
    expect(revoked.isActive).toBe(false);
    expect(replacement.isActive).toBe(true);
    expect(replacement.id).not.toBe(current.id);
    expect(result.rawKey).toMatch(/^fp_test_/);
    expect(JSON.stringify(result)).not.toContain(replacement.keyHash);
  });
});
