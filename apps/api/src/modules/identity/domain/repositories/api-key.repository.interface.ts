import { ApiKey } from '../entities/api-key.entity';

export const API_KEY_REPOSITORY = Symbol('API_KEY_REPOSITORY');

export interface IApiKeyRepository {
  findById(id: string): Promise<ApiKey | null>;
  findByTenantId(tenantId: string): Promise<ApiKey[]>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  save(apiKey: ApiKey): Promise<void>;
  saveMany(apiKeys: ApiKey[]): Promise<void>;
}
