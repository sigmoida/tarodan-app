import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UserService } from "./user.service";
import { UserCommonService } from "./user-common.service";
import { UserProfileService } from "./profile/user-profile.service";
import { UserAddressService } from "./profile/user-address.service";
import { UserSocialService } from "./social/user-social.service";
import { UserStatsService } from "./stats/user-stats.service";
import { UserAnalyticsService } from "./stats/user-analytics.service";
import { UserDiscoveryService } from "./social/user-discovery.service";
import { UserBankService } from "./seller/user-bank.service";
import { UserEngagementService } from "./stats/user-engagement.service";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { RatingService } from "../rating/rating.service";
import { ModerationAiClient } from "../moderation/moderation-ai.client";

describe("UserService deleteAddress (edge case 1.11)", () => {
  let service: UserService;

  const mockAddress = {
    id: "addr-1",
    userId: "user-1",
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
        UserEngagementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { checkRateLimit: jest.fn() } },
        { provide: NotificationService, useValue: {} },
        { provide: RatingService, useValue: {} },
        {
          provide: ModerationAiClient,
          useValue: { assertTextClean: jest.fn(), assertImageClean: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(UserService);
  });

  it("throws BadRequestException when open orders reference this shipping address", async () => {
    mockPrisma.order.count.mockResolvedValue(1);

    await expect(service.deleteAddress("user-1", "addr-1")).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.deleteAddress("user-1", "addr-1"),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.user.addressHasOpenOrders" },
    });
    expect(mockPrisma.address.delete).not.toHaveBeenCalled();
  });

  it("deletes address when no blocking orders", async () => {
    mockPrisma.order.count.mockResolvedValue(0);

    await service.deleteAddress("user-1", "addr-1");

    expect(mockPrisma.order.count).toHaveBeenCalledWith({
      where: {
        buyerId: "user-1",
        shippingAddressId: "addr-1",
        status: {
          in: expect.any(Array),
        },
      },
    });
    expect(mockPrisma.address.delete).toHaveBeenCalledWith({
      where: { id: "addr-1" },
    });
  });

  it("throws NotFoundException when address not owned by user", async () => {
    mockPrisma.address.findFirst.mockResolvedValue(null);

    await expect(service.deleteAddress("user-1", "missing")).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.order.count).not.toHaveBeenCalled();
  });
});
