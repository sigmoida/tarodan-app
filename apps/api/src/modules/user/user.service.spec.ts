import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { UserCommonService } from './user-common.service';
import { UserProfileService } from './user-profile.service';
import { UserAddressService } from './user-address.service';
import { UserSocialService } from './user-social.service';
import { UserStatsService } from './user-stats.service';
import { UserAnalyticsService } from './user-analytics.service';
import { UserDiscoveryService } from './user-discovery.service';
import { UserBankService } from './user-bank.service';
import { PrismaService } from '../../prisma';
import { NotificationService } from '../notification/notification.service';
import { RatingService } from '../rating/rating.service';
import { ModerationAiClient } from '../moderation/moderation-ai.client';

describe('UserService deleteAddress (edge case 1.11)', () => {
  let service: UserService;

  const mockAddress = {
    id: 'addr-1',
    userId: 'user-1',
    isDefault: false,
  };

  const mockPrisma = {
    address: {
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    order: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.address.findFirst.mockResolvedValue(mockAddress);
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.address.delete.mockResolvedValue(mockAddress);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        UserCommonService,
        UserProfileService,
        UserAddressService,
        UserSocialService,
        UserStatsService,
        UserAnalyticsService,
        UserDiscoveryService,
        UserBankService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: {} },
        { provide: RatingService, useValue: {} },
        { provide: ModerationAiClient, useValue: { assertTextClean: jest.fn(), assertImageClean: jest.fn() } },
      ],
    }).compile();

    service = module.get(UserService);
  });

  it('throws BadRequestException when open orders reference this shipping address', async () => {
    mockPrisma.order.count.mockResolvedValue(1);

    await expect(service.deleteAddress('user-1', 'addr-1')).rejects.toThrow(BadRequestException);
    await expect(service.deleteAddress('user-1', 'addr-1')).rejects.toThrow(
      /devam eden siparişleriniz var/i,
    );
    expect(mockPrisma.address.delete).not.toHaveBeenCalled();
  });

  it('deletes address when no blocking orders', async () => {
    mockPrisma.order.count.mockResolvedValue(0);

    const result = await service.deleteAddress('user-1', 'addr-1');

    expect(mockPrisma.order.count).toHaveBeenCalledWith({
      where: {
        buyerId: 'user-1',
        shippingAddressId: 'addr-1',
        status: {
          in: expect.any(Array),
        },
      },
    });
    expect(mockPrisma.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-1' } });
    expect(result.message).toBe('Adres silindi');
  });

  it('throws NotFoundException when address not owned by user', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(null);

    await expect(service.deleteAddress('user-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(mockPrisma.order.count).not.toHaveBeenCalled();
  });
});
