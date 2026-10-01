import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { API_KEY_REPOSITORY, type IApiKeyRepository } from '../../domain/repositories/api-key.repository.interface';
import { ApiKey } from '../../domain/entities/api-key.entity';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';
import type { GeneratedApiKeyResponseDto } from '../dto/api-key-response.dto';

@Injectable()
export class RegenerateApiKeyUseCase {
  constructor(@Inject(API_KEY_REPOSITORY) private readonly keys: IApiKeyRepository) {}

  async execute(tenantId: string, apiKeyId: string): Promise<GeneratedApiKeyResponseDto> {
    const current = await this.keys.findById(apiKeyId);
    if (!current || current.tenantId !== tenantId) throw new NotFoundException('No se encontró la API Key para este tenant');
    if (!current.isActive) throw new ConflictException('La API Key ya está revocada');
    const generated = CryptoUtil.generateApiKey(current.type);
    const replacement = ApiKey.create({
      tenantId,
      name: current.name,
      type: current.type,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      maskedKey: generated.maskedKey,
      expiresAt: current.expiresAt,
    });
    current.revoke();
    await this.keys.saveMany([current, replacement]);
    return {
      id: replacement.id,
      tenantId,
      name: replacement.name,
      type: replacement.type,
      keyPrefix: replacement.keyPrefix,
      maskedKey: replacement.maskedKey,
      isActive: true,
      expiresAt: replacement.expiresAt,
      lastUsedAt: replacement.lastUsedAt,
      createdAt: replacement.createdAt,
      rawKey: generated.rawKey,
    };
  }
}
