import { Prisma, ProductKind, ProductStatus } from "@prisma/client";
import { BOOST_OFFER_MAX, BOOST_OFFER_WINDOW_DAYS } from "@tarodan/types";
import { BoostAudienceService } from "./boost-audience.service";
import { BoostOfferService } from "./boost-offer.service";

/**
 * The one-time boost offer: computed from the listing, never stored. A
 * listing is offered when the seller's live listing was created after
 * `boost_offer_since` and in the last 30 days, was never boosted, was not
 * dismissed and has a package for its price; only dismissals are stored, for
 * the seller's own listings.
 */

const SELLER = "seller-1";
const DAY = 24 * 60 * 60 * 1000;

type Setting = { settingKey: string; settingValue: string };

const listing = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Listing ${id}`,
  price: new Prisma.Decimal(500),
  oldPrice: null,
  createdAt: new Date(Date.now() - DAY),
  images: [{ cardKey: `products/${id}/card.webp` }],
  ...over,
});

const tier = (min: number, max: number | null) => ({
  minAmount: new Prisma.Decimal(min),
  maxAmount: max == null ? null : new Prisma.Decimal(max),
});

function setup(
  opts: {
    settings?: Setting[];
    candidates?: Array<ReturnType<typeof listing>>;
    tiers?: Array<ReturnType<typeof tier>>;
    own?: Array<{ id: string }>;
  } = {},
) {
  const since = new Date(Date.now() - 10 * DAY).toISOString();
  const prisma = {
    platformSetting: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          opts.settings ?? [
            { settingKey: "boost_offer_since", settingValue: since },
          ],
        ),
    },
    product: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { id?: unknown } }) =>
          Promise.resolve(
            where.id
              ? (opts.own ?? [])
              : (opts.candidates ?? [listing("p2"), listing("p1")]),
          ),
        ),
    },
    adPackageTier: {
      findMany: jest.fn().mockResolvedValue(opts.tiers ?? [tier(200, 999)]),
    },
    userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    boostOfferDismissal: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const sentry = { setTag: jest.fn(), addBreadcrumb: jest.fn() };
  const service = new BoostOfferService(
    prisma as never,
    new BoostAudienceService(prisma as never),
    { getPublicAssetUrl: (k: string) => `https://cdn.test/${k}` } as never,
    sentry as never,
  );
  const candidateQuery = () =>
    (
      prisma.product.findMany.mock.calls.find(
        ([args]: [{ where: { id?: unknown } }]) => !args.where.id,
      ) as [{ where: Record<string, unknown>; take: number; orderBy: unknown }]
    )[0];
  return { service, prisma, sentry, since, candidateQuery };
}

describe("BoostOfferService.getOffers", () => {
  it("returns the due listings newest first with title, image, price and date", async () => {
    const { service } = setup();

    const result = await service.getOffers(SELLER);

    expect(result.enabled).toBe(true);
    expect(result.offers.map((o) => o.productId)).toEqual(["p2", "p1"]);
    expect(result.offers[0]).toEqual({
      productId: "p2",
      title: "Listing p2",
      image: "https://cdn.test/products/p2/card.webp",
      price: 500,
      createdAt: expect.any(String),
    });
  });

  it("returns a null image when the listing has no image", async () => {
    const { service } = setup({ candidates: [listing("p3", { images: [] })] });

    const result = await service.getOffers(SELLER);

    expect(result.offers[0].image).toBeNull();
  });

  it.each([
    ["missing", []],
    ["empty", [{ settingKey: "boost_offer_since", settingValue: "" }]],
    ["invalid", [{ settingKey: "boost_offer_since", settingValue: "soon" }]],
  ])(
    "boost_offer_since %s: offers are off, nothing is read",
    async (_name, settings) => {
      const { service, prisma } = setup({ settings });

      await expect(service.getOffers(SELLER)).resolves.toEqual({
        enabled: true,
        offers: [],
      });
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    },
  );

  it("boost sales off: enabled false and no offers", async () => {
    const { service, prisma } = setup({
      settings: [
        { settingKey: "boost_enabled", settingValue: "false" },
        {
          settingKey: "boost_offer_since",
          settingValue: new Date(Date.now() - DAY).toISOString(),
        },
      ],
    });

    await expect(service.getOffers(SELLER)).resolves.toEqual({
      enabled: false,
      offers: [],
    });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("reads one candidate query: own live listings, never boosted, not dismissed", async () => {
    // The four exclusions are in the one query: someone else's or not live
    // (seller and status), already boosted (any non-abandoned boost row),
    // dismissed (the dismissal row).
    const { service, candidateQuery } = setup();

    await service.getOffers(SELLER);

    const query = candidateQuery();
    expect(query.where).toEqual({
      sellerId: SELLER,
      kind: ProductKind.listing,
      status: ProductStatus.active,
      createdAt: { gte: expect.any(Date) },
      boosts: {
        none: { status: { in: ["active", "paused", "expired", "cancelled"] } },
      },
      boostOfferDismissal: { is: null },
    });
    expect(query.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("a pending or failed boost (an abandoned checkout) does not count as boosted", async () => {
    const { service, candidateQuery } = setup();

    await service.getOffers(SELLER);

    const none = (
      candidateQuery().where.boosts as { none: { status: { in: string[] } } }
    ).none.status.in;
    expect(none).not.toContain("pending");
    expect(none).not.toContain("failed");
  });

  it("the window starts at boost_offer_since when it is within the last 30 days", async () => {
    const { service, since, candidateQuery } = setup();

    await service.getOffers(SELLER);

    const from = (candidateQuery().where.createdAt as { gte: Date }).gte;
    expect(from.toISOString()).toBe(since);
  });

  it("the window starts 30 days ago when boost_offer_since is older", async () => {
    const before = Date.now();
    const { service, candidateQuery } = setup({
      settings: [
        {
          settingKey: "boost_offer_since",
          settingValue: "2020-01-01T00:00:00Z",
        },
      ],
    });

    await service.getOffers(SELLER);

    const from = (candidateQuery().where.createdAt as { gte: Date }).gte;
    const windowMs = BOOST_OFFER_WINDOW_DAYS * DAY;
    expect(from.getTime()).toBeGreaterThanOrEqual(before - windowMs);
    expect(from.getTime()).toBeLessThanOrEqual(Date.now() - windowMs);
  });

  it("drops a listing no package tier covers, by its price band (one tier query, filtered in memory)", async () => {
    const { service, prisma } = setup({
      candidates: [
        listing("cheap", { price: new Prisma.Decimal(50) }),
        listing("mid", { price: new Prisma.Decimal(999) }),
        listing("edge", { price: new Prisma.Decimal(200) }),
        listing("pricey", { price: new Prisma.Decimal(5000) }),
      ],
      tiers: [tier(200, 999)],
    });

    const { offers } = await service.getOffers(SELLER);

    expect(offers.map((o) => o.productId)).toEqual(["mid", "edge"]);
    expect(prisma.adPackageTier.findMany).toHaveBeenCalledTimes(1);
  });

  it("matches the band on the list price of a discounted listing, like the boost options", async () => {
    // boostTierBasePrice: the struck-through price when it is higher.
    const { service } = setup({
      candidates: [
        listing("sale", {
          price: new Prisma.Decimal(150),
          oldPrice: new Prisma.Decimal(300),
        }),
      ],
      tiers: [tier(200, 999)],
    });

    const { offers } = await service.getOffers(SELLER);

    expect(offers.map((o) => o.productId)).toEqual(["sale"]);
  });

  it("asks only for active tiers of active packages open to this seller", async () => {
    const { service, prisma } = setup();

    await service.getOffers(SELLER);

    const [args] = prisma.adPackageTier.findMany.mock.calls[0] as [
      {
        where: {
          isActive: boolean;
          package: { isActive: boolean; OR: unknown[] };
        };
      },
    ];
    expect(args.where.isActive).toBe(true);
    expect(args.where.package.isActive).toBe(true);
    // The audience rule (everyone, the seller's tier or the seller).
    expect(args.where.package.OR).toContainEqual({ audienceMode: "everyone" });
    expect(args.where.package.OR).toContainEqual({
      audienceMode: "specific_users",
      targetUsers: { some: { userId: SELLER } },
    });
  });

  it("no package for any price: no offers", async () => {
    const { service } = setup({ tiers: [] });

    await expect(service.getOffers(SELLER)).resolves.toEqual({
      enabled: true,
      offers: [],
    });
  });

  it(`caps the dialog at ${BOOST_OFFER_MAX} listings`, async () => {
    const many = Array.from({ length: BOOST_OFFER_MAX + 5 }, (_, i) =>
      listing(`p${i}`),
    );
    const { service } = setup({ candidates: many });

    const { offers } = await service.getOffers(SELLER);

    expect(offers).toHaveLength(BOOST_OFFER_MAX);
    expect(offers[0].productId).toBe("p0");
  });

  it("reads a bounded candidate set beyond the cap, so out-of-band listings do not hide later ones", async () => {
    const { service, candidateQuery } = setup();

    await service.getOffers(SELLER);

    expect(candidateQuery().take).toBe(BOOST_OFFER_MAX * 5);
  });
});

describe("BoostOfferService.dismissOffers", () => {
  it("records the caller's own listings only, idempotently", async () => {
    const { service, prisma } = setup({ own: [{ id: "p1" }] });

    await service.dismissOffers(SELLER, ["p1", "someone-elses", "p1"]);

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["p1", "someone-elses"] },
        sellerId: SELLER,
        kind: ProductKind.listing,
      },
      select: { id: true },
    });
    expect(prisma.boostOfferDismissal.createMany).toHaveBeenCalledWith({
      data: [
        { productId: "p1", userId: SELLER, dismissedAt: expect.any(Date) },
      ],
      skipDuplicates: true,
    });
  });

  it("someone else's listing changes nothing", async () => {
    const { service, prisma } = setup({ own: [] });

    await service.dismissOffers(SELLER, ["someone-elses"]);

    expect(prisma.boostOfferDismissal.createMany).not.toHaveBeenCalled();
  });

  it("leaves Sentry breadcrumbs with ids only", async () => {
    const { service, sentry } = setup({ own: [{ id: "p1" }] });

    await service.dismissOffers(SELLER, ["p1"]);

    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "boost",
      message: "boost.offer_dismissed",
      level: "info",
      data: { productId: "p1" },
    });
  });
});
