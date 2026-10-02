import { Entity } from '../../../../shared/domain/entity.base';

export type ApiKeyType = 'test' | 'live';

export interface ApiKeyProps {
  tenantId: string;
  name: string;
  type: ApiKeyType;
  keyPrefix: string;
  keyHash: string;
  maskedKey: string;
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
}

export class ApiKey extends Entity<ApiKeyProps> {
  private constructor(props: ApiKeyProps, id?: string, createdAt?: Date, updatedAt?: Date) {
    super(props, id, createdAt, updatedAt);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get name(): string {
    return this.props.name;
  }

  get type(): ApiKeyType {
    return this.props.type;
  }

  get keyPrefix(): string {
    return this.props.keyPrefix;
  }

  get keyHash(): string {
    return this.props.keyHash;
  }

  get maskedKey(): string {
    return this.props.maskedKey;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  get lastUsedAt(): Date | undefined {
    return this.props.lastUsedAt;
  }

  public revoke(): void {
    this.props.isActive = false;
    this._updatedAt = new Date();
  }

  public recordUsage(): void {
    this.props.lastUsedAt = new Date();
    this._updatedAt = new Date();
  }

  public static create(
    props: {
      tenantId: string;
      name: string;
      type: ApiKeyType;
      keyPrefix: string;
      keyHash: string;
      maskedKey: string;
      expiresAt?: Date;
    },
    id?: string,
  ): ApiKey {
    return new ApiKey(
      {
        tenantId: props.tenantId,
        name: props.name,
        type: props.type,
        keyPrefix: props.keyPrefix,
        keyHash: props.keyHash,
        maskedKey: props.maskedKey,
        isActive: true,
        expiresAt: props.expiresAt,
      },
      id,
    );
  }

  public static reconstitute(
    props: {
      tenantId: string;
      name: string;
      type: ApiKeyType;
      keyPrefix: string;
      keyHash: string;
      maskedKey: string;
      isActive: boolean;
      expiresAt?: Date;
      lastUsedAt?: Date;
    },
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): ApiKey {
    return new ApiKey(props, id, createdAt, updatedAt);
  }
}
