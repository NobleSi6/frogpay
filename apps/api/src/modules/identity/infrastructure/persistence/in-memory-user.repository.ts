import { Injectable } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';

/**
 * Implementación In-Memory de IUserRepository.
 * Cumple con el aislamiento de usuarios y tokens de invitación (HU-01B).
 */
@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  private readonly items: Map<string, User> = new Map();

  async findById(id: string): Promise<User | null> {
    const user = this.items.get(id);
    return user ? user : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const cleanEmail = email.trim().toLowerCase();
    for (const user of this.items.values()) {
      if (user.email.value === cleanEmail) {
        return user;
      }
    }
    return null;
  }

  async findByInvitationToken(token: string): Promise<User | null> {
    for (const user of this.items.values()) {
      if (user.invitationToken === token) {
        return user;
      }
    }
    return null;
  }

  async save(user: User): Promise<void> {
    this.items.set(user.id, user);
  }

  public clear(): void {
    this.items.clear();
  }
}
