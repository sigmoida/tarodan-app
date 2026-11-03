import { BadRequestException } from "@nestjs/common";
import type { UpdateProductDto } from "../dto";
import { ProductUpdateService } from "./product-update.service";

/**
 * Listing edit and the catalog references (brand, car model, manufacturer).
 *
 * Regression: every client sends the record's own references on every save
 * (`buildListingUpdatePayload` on web and admin, the mobile edit form), and the
 * API validated them again. A listing whose manufacturer, brand or model had
 * been deactivated since could no longer save even a price change: admin,
 * web and mobile all got `server.product.invalidBrandModelManufacturer`.
 * Only references that change are validated now, and the write uses the same
 * resolved values as the check.
 */
describe("ProductUpdateService: catalog references on edit", () => {
  const sellerId = "seller-1";
  const productId = "product-1";

  type BrandRow = { id: string; isActive: boolean };
  type ModelRow = { id: string; isActive: boolean; brandId: string };
  type MakerRow = { id: string; isActive: boolean };

  const ACTIVE_CATALOG = {
    brands: [
      { id: "brand-a", isActive: true },
      { id: "brand-b", isActive: true },
    ] as BrandRow[],
    models: [
      { id: "model-a1", isActive: true, brandId: "brand-a" },
      { id: "model-b1", isActive: true, brandId: "brand-b" },
    ] as ModelRow[],
    makers: [{ id: "maker-1", isActive: true }] as MakerRow[],
  };

  const makeService = ({
    stored = {},
    brands = ACTIVE_CATALOG.brands,
    models = ACTIVE_CATALOG.models,
    makers = ACTIVE_CATALOG.makers,
  }: {
    stored?: Record<string, unknown>;
    brands?: BrandRow[];
    models?: ModelRow[];
    makers?: MakerRow[];
  } = {}) => {
    const tx = {
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
      product: {
        update: jest.fn().mockResolvedValue({
          id: productId,
          sellerId,
          images: [],
          productAttributes: [],
        }),
      },
      productRemovalEvent: { createMany: jest.fn() },
    };
    const byId =
      <T extends { id: string }>(rows: T[]) =>
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: productId,
          sellerId,
          version: 4,
          title: "Listing",
          description: "Listing description",
          price: 100,
          oldPrice: null,
          originalPrice: null,
          salePrice: null,
          categoryId: "cat-1",
          brandId: "brand-a",
          carModelId: "model-a1",
          manufacturerId: "maker-1",
          status: "active",
          quantity: 1,
          reservedQuantity: 0,
          images: [],
          ...stored,
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isBanned: false, membership: null }),
      },
      brand: { findUnique: jest.fn(byId(brands)) },
      carModel: { findUnique: jest.fn(byId(models)) },
      manufacturer: { findUnique: jest.fn(byId(makers)) },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    };
    const service = new ProductUpdateService(
      prisma as never,
      { del: jest.fn(), delPattern: jest.fn() } as never, // cache
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as never, // search
      {} as never, // notification
      {} as never, // smtp
      { formatProductResponse: jest.fn().mockResolvedValue({}) } as never,
      {
        recomputeProductRanking: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never, // membership
      { assertListingRuleExists: jest.fn() } as never,
      { assertTextClean: jest.fn(), isEnabled: false } as never,
    );
    return { service, prisma, tx };
  };

  // The wire body: `null` passes validation for every reference although the
  // DTO types `brandId` and `manufacturerId` as `string`.
  type Body = { [K in keyof UpdateProductDto]?: UpdateProductDto[K] | null };
  const actors = [
    [
      "seller",
      (service: ProductUpdateService, body: Body) =>
        service.update(productId, sellerId, body as UpdateProductDto),
    ],
    [
      "admin",
      (service: ProductUpdateService, body: Body) =>
        service.updateAsAdmin(productId, "admin-1", body as UpdateProductDto),
    ],
  ] as const;

  const writtenData = (tx: { product: { update: jest.Mock } }) =>
    tx.product.update.mock.calls[0][0].data as Record<string, unknown>;

  /** `undefined` in a Prisma update leaves the relation as it is. */
  const expectUntouched = (
    data: Record<string, unknown>,
    ...relations: Array<"brand" | "carModel" | "manufacturer">
  ) => {
    for (const relation of relations) expect(data[relation]).toBeUndefined();
  };

  const expectRefusedWithoutWrite = async (
    promise: Promise<unknown>,
    prisma: { $transaction: jest.Mock },
  ) => {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      i18nKey: "server.product.invalidBrandModelManufacturer",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  };

  describe.each(actors)("as %s", (_actor, save) => {
    it("saves a price change on a listing whose manufacturer was deactivated (the reported bug)", async () => {
      // Built like `buildListingUpdatePayload`: same refs, `carModelId: null`
      // for a listing without a model.
      const { service, tx } = makeService({
        stored: { carModelId: null },
        makers: [{ id: "maker-1", isActive: false }],
      });

      await save(service, {
        price: 150,
        brandId: "brand-a",
        carModelId: null,
        manufacturerId: "maker-1",
      });

      const data = writtenData(tx);
      expect(data.price).toBe(150);
      expectUntouched(data, "brand", "carModel", "manufacturer");
    });

    it.each([
      ["brand", { brands: [{ id: "brand-a", isActive: false }] }],
      [
        "model",
        { models: [{ id: "model-a1", isActive: false, brandId: "brand-a" }] },
      ],
    ])(
      "saves unchanged references when the %s is inactive",
      async (_ref, catalog) => {
        const { service, tx } = makeService(catalog);

        await save(service, {
          price: 150,
          brandId: "brand-a",
          carModelId: "model-a1",
          manufacturerId: "maker-1",
        });

        expectUntouched(writtenData(tx), "brand", "carModel");
      },
    );

    it("saves when the stored model now belongs to another brand", async () => {
      const { service, tx } = makeService({
        models: [{ id: "model-a1", isActive: true, brandId: "brand-b" }],
      });

      await save(service, {
        price: 150,
        brandId: "brand-a",
        carModelId: "model-a1",
        manufacturerId: "maker-1",
      });

      expect(tx.product.update).toHaveBeenCalled();
      expectUntouched(writtenData(tx), "carModel");
    });

    it.each([
      [
        "inactive",
        [...ACTIVE_CATALOG.brands, { id: "brand-x", isActive: false }],
      ],
      ["unknown", ACTIVE_CATALOG.brands],
    ])("refuses a brand change to an %s brand", async (_kind, brands) => {
      const { service, prisma } = makeService({ brands });

      await expectRefusedWithoutWrite(
        save(service, { brandId: "brand-x", carModelId: null }),
        prisma,
      );
    });

    it.each<[string, Body]>([
      ["brandId", { brandId: null }],
      ["manufacturerId", { manufacturerId: null }],
    ])("refuses clearing %s", async (_field, body) => {
      const { service, prisma } = makeService();

      await expectRefusedWithoutWrite(save(service, body), prisma);
    });

    it("saves a brand change with carModelId omitted and clears the model (mobile 1.0.5-1.1.1)", async () => {
      const { service, tx } = makeService();

      await save(service, { brandId: "brand-b", manufacturerId: "maker-1" });

      expect(writtenData(tx)).toMatchObject({
        brand: { connect: { id: "brand-b" } },
        carModel: { disconnect: true },
      });
      expectUntouched(writtenData(tx), "manufacturer");
    });

    it("saves a manufacturer change and answers with the manufacturer", async () => {
      const { service, tx } = makeService({
        makers: [...ACTIVE_CATALOG.makers, { id: "maker-2", isActive: true }],
      });

      await save(service, { manufacturerId: "maker-2" });

      expect(writtenData(tx)).toMatchObject({
        manufacturer: { connect: { id: "maker-2" } },
      });
      // The response is formatted from this row, without a re-read.
      expect(tx.product.update.mock.calls[0][0].include).toHaveProperty(
        "manufacturer",
      );
    });

    it("refuses a brand change that keeps the old brand's model", async () => {
      const { service, prisma } = makeService();

      await expectRefusedWithoutWrite(
        save(service, { brandId: "brand-b", carModelId: "model-a1" }),
        prisma,
      );
    });

    it("saves a brand change with a model of the new brand", async () => {
      const { service, tx } = makeService();

      await save(service, { brandId: "brand-b", carModelId: "model-b1" });

      expect(writtenData(tx)).toMatchObject({
        brand: { connect: { id: "brand-b" } },
        carModel: { connect: { id: "model-b1" } },
      });
    });

    it("refuses an inactive model under the same brand", async () => {
      const { service, prisma } = makeService({
        models: [
          ...ACTIVE_CATALOG.models,
          { id: "model-a2", isActive: false, brandId: "brand-a" },
        ],
      });

      await expectRefusedWithoutWrite(
        save(service, { brandId: "brand-a", carModelId: "model-a2" }),
        prisma,
      );
    });

    it("saves a price change on a legacy listing without brand or manufacturer", async () => {
      const { service, tx } = makeService({
        stored: { brandId: null, carModelId: null, manufacturerId: null },
      });

      await save(service, { price: 150 });

      expect(writtenData(tx).price).toBe(150);
      expectUntouched(writtenData(tx), "brand");
    });

    it("keeps the model when the mobile edit omits carModelId with the same brand", async () => {
      const { service, prisma, tx } = makeService();

      await save(service, { brandId: "brand-a", manufacturerId: "maker-1" });

      expectUntouched(writtenData(tx), "carModel");
      expect(prisma.brand.findUnique).not.toHaveBeenCalled();
      expect(prisma.carModel.findUnique).not.toHaveBeenCalled();
      expect(prisma.manufacturer.findUnique).not.toHaveBeenCalled();
    });
  });
});
