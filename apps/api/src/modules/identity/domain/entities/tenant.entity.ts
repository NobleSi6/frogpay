import { Entity } from '../../../../shared/domain/entity.base';
import { Email } from '../value-objects/email.vo';
import { TaxId } from '../value-objects/tax-id.vo';

export type TenantStatus = 'active' | 'inactive' | 'suspended';
export type TenantPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export interface TenantProps {
  name: string;
  taxId: TaxId;
  contactEmail: Email;
  status: TenantStatus;
  plan: TenantPlan;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export class Tenant extends Entity<TenantProps> {
  private constructor(props: TenantProps, id?: string, createdAt?: Date, updatedAt?: Date) {
    super(props, id, createdAt, updatedAt);
  }

  get name(): string {
    return this.props.name;
  }

  get taxId(): TaxId {
    return this.props.taxId;
  }

  get contactEmail(): Email {
    return this.props.contactEmail;
  }

  get status(): TenantStatus {
    return this.props.status;
  }

  get plan(): TenantPlan {
    return this.props.plan;
  }

  get webhookUrl(): string | undefined {
    return this.props.webhookUrl;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }

  public activate(): void {
    this.props.status = 'active';
    this._updatedAt = new Date();
  }

  public suspend(): void {
    this.props.status = 'suspended';
    this._updatedAt = new Date();
  }

  public updateWebhook(url: string): void {
    this.props.webhookUrl = url;
    this._updatedAt = new Date();
  }

  public static create(
    props: {
      name: string;
      taxId: string;
      contactEmail: string;
      plan?: TenantPlan;
      webhookUrl?: string;
      metadata?: Record<string, unknown>;
    },
    id?: string,
  ): Tenant {
    if (!props.name || props.name.trim().length < 2) {
      throw new Error('El nombre de la empresa/tenant debe tener al menos 2 caracteres');
    }

    const taxIdVo = TaxId.create(props.taxId);
    const emailVo = Email.create(props.contactEmail);

    return new Tenant(
      {
        name: props.name.trim(),
        taxId: taxIdVo,
        contactEmail: emailVo,
        status: 'active',
        plan: props.plan || 'free',
        webhookUrl: props.webhookUrl,
        metadata: props.metadata || {},
      },
      id,
    );
  }

  public static reconstitute(
    props: {
      name: string;
      taxId: string;
      contactEmail: string;
      status: TenantStatus;
      plan: TenantPlan;
      webhookUrl?: string;
      metadata?: Record<string, unknown>;
    },
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): Tenant {
    return new Tenant(
      {
        name: props.name,
        taxId: TaxId.create(props.taxId),
        contactEmail: Email.create(props.contactEmail),
        status: props.status,
        plan: props.plan,
        webhookUrl: props.webhookUrl,
        metadata: props.metadata,
      },
      id,
      createdAt,
      updatedAt,
    );
  }
}
