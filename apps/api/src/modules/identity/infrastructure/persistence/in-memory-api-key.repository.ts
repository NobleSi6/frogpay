import { Injectable } from '@nestjs/common';
import { IApiKeyRepository } from '../../domain/repositories/api-key.repository.interface';
import { ApiKey } from '../../domain/entities/api-key.entity';

/**
 * Implementación In-Memory de IApiKeyRepository.
 * Maneja llaves de API asegurando que solo se busque y compare por Hash SHA-256 (RNF-05).
 */
@Injectable()
export class InMemoryApiKeyRepository implements IApiKeyRepository {
  private readonly items: Map<string, ApiKey> = new Map();

  async findById(id: string): Promise<ApiKey | null> {
    const key = this.items.get(id);
    return key ? key : null;
  }

  async findByTenantId(tenantId: string): Promise<ApiKey[]> {
    const keys: ApiKey[] = [];
    for (const key of this.items.values()) {
      if (key.tenantId === tenantId) {
        keys.push(key);
      }
    }
    return keys;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    for (const key of this.items.values()) {
      if (key.keyHash === keyHash && key.isActive) {
        return key;
      }
    }
    return null;
  }

  async save(apiKey: ApiKey): Promise<void> {
    this.items.set(apiKey.id, apiKey);
  }

  async saveMany(apiKeys: ApiKey[]): Promise<void> {
    for (const key of apiKeys) {
      this.items.set(key.id, key);
    }
  }

  public clear(): void {
    this.items.clear();
  }
}
