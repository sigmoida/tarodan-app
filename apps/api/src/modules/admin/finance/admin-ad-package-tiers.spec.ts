import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import {
  CreateAdPackageDto,
  RefundBoostDto,
  type AdPackageTierDto,
} from "../dto/ad-package.dto";
import { translateMessage } from "../../i18n/translate";
import { AdminAdPackageService } from "./admin-ad-package.service";

const row = (over: Partial<AdPackageTierDto> = {}): AdPackageTierDto => ({
  durationDays: 7,
  minAmount: 0,
  maxAmount: null,
  price: 150,
  campaignPrice: null,
  isActive: true,
  ...over,
});

/**
 * Admin save of an ad package's tiers (money): the lookups price a listing by
 * the one tier whose half-open band `[minAmount, maxAmount)` covers its price,
 * so a save that would let two active tiers of one duration cover the same
 * price, or a band that covers nothing, is refused before any write.
 */
describe("AdminAdPackageService tier bands", () => {
  function make() {
    const tx = {
      adPackage: {
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "pkg-1",
          tiers: [],
          targetTiers: [],
          targetUsers: [],
        }),
      },
      adPackageTier: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      adPackageMembershipTier: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn(),
      },
      adPackageUserTarget: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      adPackage: {
        findUnique: jest.fn(({ where }: { where: { id?: string } }) =>
          Promise.resolve(
            where.id
              ? {
                  id: where.id,
                  slug: "ekonomik",
                  audienceMode: "everyone",
                  targetTiers: [],
                  targetUsers: [],
                }
              : null,
          ),
        ),
        create: jest.fn().mockResolvedValue({
          id: "pkg-1",
          tiers: [],
          targetTiers: [],
          targetUsers: [],
        }),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AdminAdPackageService(prisma as never, {} as never);
    const create = (tiers: AdPackageTierDto[]) =>
      service.createPackage({ name: "Ekonomik", slug: "ekonomik", tiers });
    const update = (tiers?: AdPackageTierDto[]) =>
      service.updatePackage("pkg-1", { name: "Ekonomik", tiers });
    return { prisma, tx, create, update };
  }

  const LAUNCH = [
    row({ minAmount: 200, maxAmount: 1000, price: 150 }),
    row({ minAmount: 1000, maxAmount: 5000, price: 250 }),
    row({ minAmount: 5000, maxAmount: null, price: 500 }),
  ];

  describe.each(["create", "update"] as const)("%s", (action) => {
    const save = (h: ReturnType<typeof make>, tiers: AdPackageTierDto[]) =>
      action === "create" ? h.create(tiers) : h.update(tiers);
    const writes = (h: ReturnType<typeof make>) =>
      action === "create" ? h.prisma.adPackage.create : h.prisma.$transaction;

    it("saves bands that touch at a boundary (the upper bound is outside)", async () => {
      const h = make();

      await save(h, LAUNCH);

      expect(writes(h)).toHaveBeenCalledTimes(1);
    });

    it("refuses two active bands of one duration that share a price, naming both rows", async () => {
      const h = make();
      const tiers = [
        row({ durationDays: 30, minAmount: 0, maxAmount: 6000 }),
        row({ minAmount: 1000, maxAmount: 5000 }),
        row({ minAmount: 4999.99, maxAmount: null }),
      ];

      await expect(save(h, tiers)).rejects.toMatchObject({
        status: 400,
        response: {
          i18nKey: "server.admin.adPackage.tierOverlap",
          i18nParams: {
            durationDays: 7,
            firstMin: 1000,
            firstMax: 5000,
            secondMin: 4999.99,
            secondMax: "none",
          },
          tierIndexes: [1, 2],
        },
      });
      expect(writes(h)).not.toHaveBeenCalled();
    });

    it("refuses a band inside another one", async () => {
      const h = make();

      await expect(
        save(h, [
          row({ minAmount: 0 }),
          row({ minAmount: 100, maxAmount: 200 }),
        ]),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          i18nKey: "server.admin.adPackage.tierOverlap",
          tierIndexes: [0, 1],
        },
      });
      expect(writes(h)).not.toHaveBeenCalled();
    });

    it("lets an inactive row and another duration keep an overlapping band", async () => {
      const h = make();

      await save(h, [
        ...LAUNCH,
        row({ minAmount: 0, maxAmount: null, isActive: false }),
        row({ durationDays: 30, minAmount: 0, maxAmount: null }),
      ]);

      expect(writes(h)).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["equal", 1000],
      ["lower", 999.99],
    ])(
      "refuses an upper bound %s to the lower bound, also on an inactive row",
      async (_label, maxAmount) => {
        const h = make();

        await expect(
          save(h, [
            ...LAUNCH,
            row({ minAmount: 1000, maxAmount, isActive: false }),
          ]),
        ).rejects.toMatchObject({
          status: 400,
          response: {
            i18nKey: "server.admin.commission.maxAboveMin",
            tierIndexes: [3],
          },
        });
        expect(writes(h)).not.toHaveBeenCalled();
      },
    );
  });

  it("does not check the tiers of an update that leaves them alone", async () => {
    const h = make();

    await h.update(undefined);

    expect(h.tx.adPackageTier.deleteMany).not.toHaveBeenCalled();
    expect(h.tx.adPackage.update).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for an unknown package before it checks the tiers", async () => {
    const h = make();
    h.prisma.adPackage.findUnique.mockResolvedValueOnce(null);

    await expect(
      h.update([row({ minAmount: 0 }), row({ minAmount: 100 })]),
    ).rejects.toMatchObject({
      status: 404,
      response: { i18nKey: "server.admin.adPackage.notFound" },
    });
  });

  it.each([
    [
      "tr",
      "7 günlük süre için fiyat aralıkları çakışmaktadır: 1.000 TL - 5.000 TL ile 4.999,99 TL - üst sınır yok.",
    ],
    [
      "en",
      "The price ranges for the 7-day duration overlap: 1,000 TL - 5,000 TL and 4,999.99 TL - no upper limit.",
    ],
  ] as const)("renders the overlap with both ranges in %s", (locale, text) => {
    const message = translateMessage(
      "server.admin.adPackage.tierOverlap",
      locale,
      {
        durationDays: 7,
        firstMin: 1000,
        firstMax: 5000,
        secondMin: 4999.99,
        secondMax: "none",
      },
    );
    expect(message.startsWith(text)).toBe(true);
  });
});

describe("ad package DTO amounts", () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const asBody = (metatype: ArgumentMetadata["metatype"], body: unknown) =>
    pipe.transform(body, {
      type: "body",
      metatype,
      data: "",
    } satisfies ArgumentMetadata);
  const withTier = (tier: Record<string, unknown>) => ({
    name: "Ekonomik",
    slug: "ekonomik",
    tiers: [
      {
        durationDays: 7,
        minAmount: 0,
        maxAmount: null,
        price: 150,
        ...tier,
      },
    ],
  });

  it("accepts whole kurus amounts and a null upper bound and campaign price", async () => {
    const body = await asBody(
      CreateAdPackageDto,
      withTier({
        minAmount: 999.99,
        maxAmount: 5000,
        price: 49.9,
        campaignPrice: null,
      }),
    );
    expect(body.tiers[0]).toMatchObject({
      minAmount: 999.99,
      maxAmount: 5000,
      price: 49.9,
      campaignPrice: null,
    });
  });

  it.each(["minAmount", "maxAmount", "price", "campaignPrice"])(
    "refuses a bad %s with 400, never a 500",
    async (field) => {
      for (const value of [
        1e-7,
        1e20, // no exponent form, but above every money column
        1e21,
        0.001,
        -1,
        0.1 + 0.2,
        "150",
        true,
      ]) {
        await expect(
          asBody(CreateAdPackageDto, withTier({ [field]: value })),
        ).rejects.toMatchObject({ status: 400 });
      }
    },
  );

  it("refuses a refund amount in exponent form or below one kurus with 400", async () => {
    const reason = "Refund for the outage on Monday";
    for (const amount of [1e-7, 0, 0.001, -5, "20"]) {
      await expect(
        asBody(RefundBoostDto, { amount, reason }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      asBody(RefundBoostDto, { amount: 20.57, reason }),
    ).resolves.toMatchObject({ amount: 20.57 });
  });
});
