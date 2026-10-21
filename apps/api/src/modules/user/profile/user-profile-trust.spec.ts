import { TradeStatus } from "@prisma/client";
import {
  SELLER_TRUST_FORMULA_VERSION,
  type SellerTrustView,
} from "@tarodan/types";
import { UserProfileService } from "./user-profile.service";

/**
 * Trust score on the profile reads (ADR 0014, plan sections 6 and 7):
 *
 * - `trust` comes from one stored lookup (`SellerTrustService.getForUser`);
 *   no rating, order or trade aggregate runs for it.
 * - Public profile: shown only for premium sellers (D6). The platform account
 *   is scored like everyone (D5), so it has no special case.
 * - `GET /users/me`: the owner always gets their own `trust`.
 * - `trustScore`/`trustLevel` (deprecated, live mobile 1.0.5) are
 *   `round(rating × 20)` and the old Turkish label, null without a score.
 */

const FUTURE = new Date(Date.now() + 30 * 86_400_000);
const PREMIUM = {
  status: "active",
  currentPeriodEnd: FUTURE,
  tier: { type: "premium", isActive: true },
  user: { businessStatus: null, companyName: null, taxId: null },
};

const SCORED: SellerTrustView = {
  rating: 3.74,
  level: "fair",
  formulaVersion: 1,
};
const NEW_SELLER: SellerTrustView = {
  rating: null,
  level: "new",
  formulaVersion: SELLER_TRUST_FORMULA_VERSION,
};

function makeService(opts: {
  membership?: unknown;
  trust?: SellerTrustView;
  sellerType?: string;
}) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: "seller-1" }),
      findUnique: jest.fn().mockResolvedValue({
        id: "seller-1",
        username: "seller",
        displayName: "Seller",
        companyName: null,
        avatarUrl: null,
        isVerified: false,
        sellerType: opts.sellerType ?? "individual",
        bio: null,
        isSeller: true,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
    },
    product: { count: jest.fn().mockResolvedValue(4) },
    order: { count: jest.fn().mockResolvedValue(12) },
    trade: { count: jest.fn().mockResolvedValue(3) },
    rating: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _avg: { score: 4.6 }, _count: 9 }),
    },
    userFollow: { count: jest.fn().mockResolvedValue(2) },
    userMembership: {
      findUnique: jest.fn().mockResolvedValue(opts.membership ?? null),
    },
    collection: { count: jest.fn().mockResolvedValue(1) },
  };
  const sellerTrust = {
    getForUser: jest.fn().mockResolvedValue(opts.trust ?? SCORED),
  };
  const service = new UserProfileService(
    prisma as never,
    {} as never, // moderationAi
    { resolveAvatarUrl: jest.fn().mockResolvedValue(null) } as never,
    { assertVisibleTo: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never, // consents
    {} as never, // newsletter
    {} as never, // search
    {} as never, // cache
    {} as never, // notifications
    sellerTrust as never,
  );
  return { service, prisma, sellerTrust };
}

describe("UserProfileService.getPublicProfile: trust score", () => {
  it("shows a premium seller's stored score with the legacy fields derived from it", async () => {
    const { service, sellerTrust } = makeService({ membership: PREMIUM });

    const profile = await service.getPublicProfile("seller-1");

    expect(sellerTrust.getForUser).toHaveBeenCalledTimes(1);
    expect(sellerTrust.getForUser).toHaveBeenCalledWith("seller-1");
    expect(profile.isPremium).toBe(true);
    expect(profile.trust).toEqual({
      rating: 3.74,
      level: "fair",
      formulaVersion: 1,
    });
    expect(profile.trustScore).toBe(75);
    expect(profile.trustLevel).toBe("Orta");
  });

  it("shows `new` for a premium seller without a score, and no legacy score", async () => {
    const { service } = makeService({
      membership: PREMIUM,
      trust: NEW_SELLER,
    });

    const profile = await service.getPublicProfile("seller-1");

    expect(profile.trust).toEqual(NEW_SELLER);
    expect(profile.trustScore).toBeNull();
    expect(profile.trustLevel).toBeNull();
  });

  it("hides every trust field for a seller who is not premium (D6)", async () => {
    const { service } = makeService({ membership: null });

    const profile = await service.getPublicProfile("seller-1");

    expect(profile.isPremium).toBe(false);
    expect(profile.trust).toBeNull();
    expect(profile.trustScore).toBeNull();
    expect(profile.trustLevel).toBeNull();
  });

  it("hides it for a lapsed membership (past period end)", async () => {
    const { service } = makeService({
      membership: { ...PREMIUM, currentPeriodEnd: new Date(Date.now() - 1) },
    });

    const profile = await service.getPublicProfile("seller-1");

    expect(profile.trust).toBeNull();
    expect(profile.trustScore).toBeNull();
  });

  it("scores the platform account like everyone else (D5)", async () => {
    const { service } = makeService({
      membership: PREMIUM,
      sellerType: "platform",
    });

    const profile = await service.getPublicProfile("seller-1");

    expect(profile.sellerType).toBe("platform");
    expect(profile.trust).toEqual(SCORED);
    expect(profile.trustScore).toBe(75);
  });

  it("runs no aggregate for the score: each counter is read once, for the stats", async () => {
    const { service, prisma } = makeService({ membership: PREMIUM });

    const profile = await service.getPublicProfile("seller-1", "viewer-1");

    expect(prisma.rating.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.order.count).toHaveBeenCalledTimes(1);
    expect(prisma.trade.count).toHaveBeenCalledTimes(1);
    expect(prisma.trade.count).toHaveBeenCalledWith({
      where: {
        OR: [{ initiatorId: "seller-1" }, { receiverId: "seller-1" }],
        status: TradeStatus.completed,
      },
    });
    // The live counters stay as they were.
    expect(profile.stats).toMatchObject({
      totalSales: 12,
      totalTrades: 3,
      averageRating: 4.6,
      totalRatings: 9,
    });
  });

  it("counts all of the owner's trades on their own profile", async () => {
    const { service, prisma } = makeService({ membership: PREMIUM });

    await service.getPublicProfile("seller-1", "seller-1");

    expect(prisma.trade.count).toHaveBeenCalledTimes(1);
    expect(prisma.trade.count).toHaveBeenCalledWith({
      where: {
        OR: [{ initiatorId: "seller-1" }, { receiverId: "seller-1" }],
      },
    });
  });
});

describe("UserProfileService.findByIdWithAddresses: trust score", () => {
  function makeOwnerService(opts: {
    membership?: unknown;
    trust?: SellerTrustView;
  }) {
    const base = makeService({ trust: opts.trust });
    const prisma = base.prisma as typeof base.prisma & {
      membershipTier: { findUnique: jest.Mock };
    };
    prisma.user.findUnique.mockResolvedValue({
      id: "seller-1",
      email: "seller@example.test",
      avatarUrl: null,
      isVerified: false,
      passwordHash: "hash",
      fcmToken: null,
      bannedBy: null,
      bannedReason: null,
      addresses: [],
      membership: opts.membership ?? null,
    });
    prisma.membershipTier = {
      findUnique: jest.fn().mockResolvedValue({
        id: "tier-free",
        type: "free",
        name: "Free",
      }),
    };
    return base;
  }

  it("gives the owner their own score even without premium", async () => {
    const { service, sellerTrust } = makeOwnerService({ membership: null });

    const me = await service.findByIdWithAddresses("seller-1");

    expect(sellerTrust.getForUser).toHaveBeenCalledWith("seller-1");
    expect(me.isPremium).toBe(false);
    expect(me.trust).toEqual(SCORED);
    expect(me.trustScore).toBe(75);
    expect(me.trustLevel).toBe("Orta");
  });

  it("gives `new` and null legacy fields without a score", async () => {
    const { service } = makeOwnerService({ trust: NEW_SELLER });

    const me = await service.findByIdWithAddresses("seller-1");

    expect(me.trust).toEqual(NEW_SELLER);
    expect(me.trustScore).toBeNull();
    expect(me.trustLevel).toBeNull();
  });

  it("keeps the live counters and reads each once", async () => {
    const { service, prisma } = makeOwnerService({});

    const me = await service.findByIdWithAddresses("seller-1");

    expect(prisma.rating.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.order.count).toHaveBeenCalledTimes(1);
    expect(prisma.trade.count).toHaveBeenCalledTimes(1);
    expect(me.stats).toMatchObject({
      totalSales: 12,
      totalTrades: 3,
      averageRating: 4.6,
      totalRatings: 9,
    });
  });
});
