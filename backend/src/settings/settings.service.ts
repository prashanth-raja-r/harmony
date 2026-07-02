import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

export interface UpdateSettingsDto {
  name?: string;
  currency?: string;
}

const SUPPORTED_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'CHF',
];

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'name', 'email', 'currency', 'createdAt', 'image'],
    });
    if (!user) throw new NotFoundException('User not found');
    return { ...user, supportedCurrencies: SUPPORTED_CURRENCIES };
  }

  async updateProfile(userId: string, dto: UpdateSettingsDto) {
    const patch: Partial<User> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.currency !== undefined && SUPPORTED_CURRENCIES.includes(dto.currency)) {
      patch.currency = dto.currency;
    }
    await this.users.update(userId, patch);
    const updated = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'name', 'email', 'currency', 'createdAt', 'image'],
    });
    if (!updated) throw new NotFoundException('User not found');
    return { ...updated, supportedCurrencies: SUPPORTED_CURRENCIES };
  }

  async deleteAccount(userId: string) {
    await this.users.delete(userId);
    return { deleted: true };
  }
}
