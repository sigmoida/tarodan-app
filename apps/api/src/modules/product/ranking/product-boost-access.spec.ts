import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { ProductKind, ProductStatus } from "@prisma/client";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { InitiateBoostDto } from "../dto/boost.dto";
import { PaymentProvider } from "../../payment/dto";
import { ProductBoostService } from "./product-boost.service";

/**
 * Who may see boost prices and start a boost, and what the boost_enabled
 * setting means. The options route was open to any signed-in user (prices of
 * packages targeted at specific users leaked); the flat 3/7/30-day price
 * without a package is retired.
 */
describe("ProductBoostService access and settings", () => {
  const OWNER = "seller-1";
  const listing = (over: Record<string, unknown> = {}) => ({
    id: "prod-1",
    sellerId: OWNER,
    status: ProductStatus.active,
    title: "Model car",
    categoryId: "cat-1",
    price: 1500,
    oldPrice: null,
    ...over,
  });

  const makePrisma = (opts: {
    product?: Record<string, unknown> | null;
    boostEnabled?: string | null;
  }) => ({
    platformSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.boostEnabled === undefined || opts.boostEnabled === null
            ? null
            : { settingValue: opts.boostEnabled },
        ),
    },
    product: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.product === undefined ? listing() : opts.product,
        ),
      create: jest.fn().mockResolvedValue({}),
    },
    userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    adPackage: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "pkg-1",
          name: "Ekonomik",
          slug: "ekonomik",
          showcaseOnHome: false,
          tiers: [
            {
              durationDays: 7,
              price: 150,
              campaignPrice: null,
              campaignStartsAt: null,
              campaignEndsAt: null,
            },
          ],
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        id: "pkg-1",
        name: "Ekonomik",
        showcaseOnHome: false,
      }),
    },
    adPackageTier: {
      findFirst: jest.fn().mockResolvedValue({
        price: 150,
        campaignPrice: null,
        campaignStartsAt: null,
        campaignEndsAt: null,
      }),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: "platform" }) },
    category: { findFirst: jest.fn().mockResolvedValue({ id: "cat-1" }) },
    order: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: "ord-1" }),
    },
    productBoost: {
      create: jest.fn().mockResolvedValue({ id: "boost-1" }),
      update: jest.fn().mockResolvedValue({}),
    },
  });

  const payment = {
    initiatePayment: jest.fn().mockResolvedValue({
      paymentId: "pay-1",
      provider: "paytr",
      expiresIn: 300,
    }),
  };

  const make = (opts: Parameters<typeof makePrisma>[0] = {}) => {
    const prisma = makePrisma(opts);
    const service = new ProductBoostService(prisma as never, payment as never);
    return { prisma, service };
  };

  describe("isBoostEnabled", () => {
    it.each([
      [null, true],
      ["", true],
      ["true", true],
      ["false", false],
    ])("setting %p -> %p", async (value, expected) => {
      const { service, prisma } = make({ boostEnabled: value });
      await expect(service.isBoostEnabled()).resolves.toBe(expected);
      expect(prisma.platformSetting.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { settingKey: "boost_enabled" } }),
      );
    });
  });

  describe("getBoostOptions", () => {
    it("returns the priced packages to the owner of an active listing", async () => {
      const { service, prisma } = make();

      const result = await service.getBoostOptions("prod-1", OWNER);

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-1", kind: ProductKind.listing },
        }),
      );
      expect(result).toEqual({
        enabled: true,
        productPrice: 1500,
        packages: [
          {
            id: "pkg-1",
            name: "Ekonomik",
            slug: "ekonomik",
            showcaseOnHome: false,
            options: [
              {
                durationDays: 7,
                price: 150,
                listPrice: 150,
                campaign: false,
                label: "7 gün",
              },
            ],
          },
        ],
      });
    });

    it("answers another user with 404 and reads no packages", async () => {
      const { service, prisma } = make();

      await expect(
        service.getBoostOptions("prod-1", "someone-else"),
      ).rejects.toMatchObject({
        status: 404,
        response: { i18nKey: "server.product.notFound" },
      });
      expect(prisma.adPackage.findMany).not.toHaveBeenCalled();
    });

    it("answers a missing listing with the same 404", async () => {
      const { service } = make({ product: null });

      await expect(
        service.getBoostOptions("prod-1", OWNER),
      ).rejects.toMatchObject({
        status: 404,
        response: { i18nKey: "server.product.notFound" },
      });
    });

    it.each([
      ProductStatus.inactive,
      ProductStatus.pending,
      ProductStatus.sold,
    ])("answers the owner of a %s listing with 400", async (status) => {
      const { service, prisma } = make({ product: listing({ status }) });

      await expect(
        service.getBoostOptions("prod-1", OWNER),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "server.product.boostActiveOnly" },
      });
      expect(prisma.adPackage.findMany).not.toHaveBeenCalled();
    });
  });

  describe("initiateBoost", () => {
    const input = {
      packageId: "pkg-1",
      durationDays: 7,
      provider: PaymentProvider.paytr,
      autoRenew: false,
    };

    it("prices the boost from the package tier and starts the payment", async () => {
      const { service, prisma } = make();

      const result = await service.initiateBoost(OWNER, "prod-1", input);

      expect(prisma.adPackageTier.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            packageId: "pkg-1",
            durationDays: 7,
          }),
        }),
      );
      expect(prisma.productBoost.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          packageId: "pkg-1",
          packageName: "Ekonomik",
          durationDays: 7,
          price: 150,
          status: "pending",
        }),
      });
      expect(result).toMatchObject({ boostId: "boost-1", price: 150 });
      // No flat-price settings are read any more.
      expect(prisma.platformSetting.findUnique).toHaveBeenCalledTimes(1);
    });

    it("refuses while boost sales are off", async () => {
      const { service, prisma } = make({ boostEnabled: "false" });

      await expect(
        service.initiateBoost(OWNER, "prod-1", input),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "server.product.boostUnavailable" },
      });
      expect(prisma.productBoost.create).not.toHaveBeenCalled();
    });

    it("refuses someone else's listing", async () => {
      const { service, prisma } = make();

      await expect(
        service.initiateBoost("someone-else", "prod-1", input),
      ).rejects.toMatchObject({
        status: 403,
        response: { i18nKey: "server.product.boostOwnOnly" },
      });
      expect(prisma.productBoost.create).not.toHaveBeenCalled();
    });

    it("refuses an inactive listing", async () => {
      const { service, prisma } = make({
        product: listing({ status: ProductStatus.inactive }),
      });

      await expect(
        service.initiateBoost(OWNER, "prod-1", input),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "server.product.boostActiveOnly" },
      });
      expect(prisma.productBoost.create).not.toHaveBeenCalled();
    });

    it("refuses a duration the package has no tier for", async () => {
      const { service, prisma } = make();
      prisma.adPackageTier.findFirst.mockResolvedValue(null);

      await expect(
        service.initiateBoost(OWNER, "prod-1", { ...input, durationDays: 5 }),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "server.product.boostPriceUndefined" },
      });
      expect(prisma.productBoost.create).not.toHaveBeenCalled();
    });
  });
});

describe("InitiateBoostDto", () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const asBody = (body: Record<string, unknown>) =>
    pipe.transform(body, {
      type: "body",
      metatype: InitiateBoostDto,
      data: "",
    } satisfies ArgumentMetadata);

  it("requires a package (the flat-price request without one is retired)", async () => {
    await expect(asBody({ durationDays: 7 })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      asBody({ packageId: "", durationDays: 7 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts a package and a duration", async () => {
    await expect(
      asBody({ packageId: "pkg-1", durationDays: "7" }),
    ).resolves.toMatchObject({ packageId: "pkg-1", durationDays: 7 });
  });
});
