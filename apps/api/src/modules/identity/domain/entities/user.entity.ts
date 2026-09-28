import { Entity } from '../../../../shared/domain/entity.base';
import { Email } from '../value-objects/email.vo';

export type UserRole =
  | 'PLATFORM_ADMIN'
  | 'OWNER'
  | 'ADMIN'
  | 'DEVELOPER'
  | 'FINANCE'
  | 'SUPPORT';

export type UserStatus = 'invited' | 'active' | 'suspended';

export interface UserProps {
  tenantId: string;
  email: Email;
  name?: string;
  role: UserRole;
  status: UserStatus;
  invitationToken?: string;
  invitationExpiresAt?: Date;
  passwordHash?: string;
}

export class User extends Entity<UserProps> {
  private constructor(props: UserProps, id?: string, createdAt?: Date, updatedAt?: Date) {
    super(props, id, createdAt, updatedAt);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get email(): Email {
    return this.props.email;
  }

  get name(): string | undefined {
    return this.props.name;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get invitationToken(): string | undefined {
    return this.props.invitationToken;
  }

  get invitationExpiresAt(): Date | undefined {
    return this.props.invitationExpiresAt;
  }

  get passwordHash(): string | undefined {
    return this.props.passwordHash;
  }

  public activate(passwordHash: string, name?: string): void {
    if (this.props.status === 'suspended') {
      throw new Error('No se puede activar un usuario suspendido');
    }
    this.props.status = 'active';
    this.props.passwordHash = passwordHash;
    if (name) this.props.name = name;
    this.props.invitationToken = undefined;
    this.props.invitationExpiresAt = undefined;
    this._updatedAt = new Date();
  }

  public suspend(): void {
    this.props.status = 'suspended';
    this._updatedAt = new Date();
  }

  public isInvitationValid(): boolean {
    if (this.props.status !== 'invited' || !this.props.invitationToken) {
      return false;
    }
    if (!this.props.invitationExpiresAt) {
      return true;
    }
    return new Date() < this.props.invitationExpiresAt;
  }

  public static createInvitedOwner(
    tenantId: string,
    email: string,
    invitationToken: string,
    expiresInHours = 72,
    id?: string,
  ): User {
    const emailVo = Email.create(email);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    return new User(
      {
        tenantId,
        email: emailVo,
        role: 'OWNER',
        status: 'invited',
        invitationToken,
        invitationExpiresAt: expiresAt,
      },
      id,
    );
  }

  public static reconstitute(
    props: {
      tenantId: string;
      email: string;
      name?: string;
      role: UserRole;
      status: UserStatus;
      invitationToken?: string;
      invitationExpiresAt?: Date;
      passwordHash?: string;
    },
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): User {
    return new User(
      {
        tenantId: props.tenantId,
        email: Email.create(props.email),
        name: props.name,
        role: props.role,
        status: props.status,
        invitationToken: props.invitationToken,
        invitationExpiresAt: props.invitationExpiresAt,
        passwordHash: props.passwordHash,
      },
      id,
      createdAt,
      updatedAt,
    );
  }
}
