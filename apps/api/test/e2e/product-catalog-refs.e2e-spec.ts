import * as request from "supertest";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
} from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";

/**
 * Listing edit and its catalog references (brand, car model, manufacturer),
 * against a real database: the relation writes reach Prisma, the validation
 * pipe lets `null` through, and a refusal leaves the row as it was.
 *
 * Clients send the record's own references on every save: web and admin via
 * `buildListingUpdatePayload` (`carModelId: null` without a model), mobile
 * 1.0.5-1.1.1 with all three and `carModelId` omitted when empty.
 */
describe("Product catalog references on create and edit (E2E)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };
  let otherBrandId: string;
  let modelId: string;

  const actors = [
    {
      name: "seller",
      path: (id: string) => `/api/products/${id}`,
      auth: async (_sellerId: string, seller: { accessToken: string }) =>
        authHeader(seller),
    },
    {
      name: "admin",
      path: (id: string) => `/api/admin/products/${id}`,
      auth: async () => authHeader(await createAdminUser(ctx.module)),
    },
  ] as const;

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    const prisma = getPrisma();
    otherBrandId = (
      await prisma.brand.create({
        data: { name: "Other Brand", slug: "other-brand", isActive: true },
      })
    ).id;
    modelId = (
      await prisma.carModel.create({
        data: {
          brandId: baseline.brandId,
          name: "Test Model",
          slug: "test-model",
          isActive: true,
        },
      })
    ).id;
  });

  /** An active listing with brand, model and manufacturer, price 100. */
  const listingWithReferences = async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      brandId: baseline.brandId,
      manufacturerId: baseline.manufacturerId,
      price: 100,
    });
    await getPrisma().product.update({
      where: { id: product.id },
      data: { carModelId: modelId },
    });
    return { seller, product };
  };

  const stored = (id: string) =>
    getPrisma().product.findUniqueOrThrow({
      where: { id },
      select: {
        price: true,
        brandId: true,
        carModelId: true,
        manufacturerId: true,
      },
    });

  const deactivateAll = async () => {
    const prisma = getPrisma();
    await prisma.brand.update({
      where: { id: baseline.brandId },
      data: { isActive: false },
    });
    await prisma.carModel.update({
      where: { id: modelId },
      data: { isActive: false },
    });
    await prisma.manufacturer.update({
      where: { id: baseline.manufacturerId },
      data: { isActive: false },
    });
  };

  describe("create (every reference counts as changed)", () => {
    const createBody = (
      sellerId: string,
      refs: Record<string, string | undefined>,
    ) => ({
      title: "Hot Wheels Porsche 911 GT3",
      description: "Boxed collectible model car in clean condition.",
      price: 150,
      categoryId: baseline.categoryId,
      condition: "new",
      color: "Red",
      scale: "1:64",
      material: "diecast",
      isBoxed: true,
      images: [1, 2, 3].map((n) => ({
        cardKey: `test/products/product-images/temp/u/${sellerId}/${n}-card.webp`,
        detailKey: `test/products/product-images/temp/u/${sellerId}/${n}-detail.webp`,
      })),
      brandId: baseline.brandId,
      manufacturerId: baseline.manufacturerId,
      ...refs,
    });

    const post = (
      seller: { id: string; accessToken: string },
      refs: Record<string, string> = {},
    ) =>
      request(ctx.app.getHttpServer())
        .post("/api/products")
        .set(authHeader(seller))
        .send(createBody(seller.id, refs));

    it("creates a listing with an active brand, model and manufacturer", async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await post(seller, { carModelId: modelId }).expect(201);

      expect(await stored(res.body.id)).toMatchObject({
        brandId: baseline.brandId,
        carModelId: modelId,
        manufacturerId: baseline.manufacturerId,
      });
    });

    it("creates a listing without a model", async () => {
      const seller = await createUser(ctx.module, { isSeller: true });

      const res = await post(seller).expect(201);

      expect((await stored(res.body.id)).carModelId).toBeNull();
    });

    it.each([
      ["a deactivated manufacturer", "manufacturer"],
      ["a deactivated brand", "brand"],
      ["a deactivated model", "carModel"],
      ["a model of another brand", "otherBrandModel"],
    ] as const)("refuses %s and creates nothing", async (_case, kind) => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const prisma = getPrisma();
      const refs: Record<string, string> = { carModelId: modelId };
      if (kind === "manufacturer") {
        await prisma.manufacturer.update({
          where: { id: baseline.manufacturerId },
          data: { isActive: false },
        });
      } else if (kind === "brand") {
        await prisma.brand.update({
          where: { id: baseline.brandId },
          data: { isActive: false },
        });
      } else if (kind === "carModel") {
        await prisma.carModel.update({
          where: { id: modelId },
          data: { isActive: false },
        });
      } else {
        refs.brandId = otherBrandId;
      }

      const res = await post(seller, refs).expect(400);

      expect(res.body.i18nKey).toBe(
        "server.product.invalidBrandModelManufacturer",
      );
      expect(
        await prisma.product.count({ where: { sellerId: seller.id } }),
      ).toBe(0);
    });
  });

  describe.each(actors)("edit as $name", ({ path, auth }) => {
    it("saves a price change with a deactivated brand, model and manufacturer (web/admin payload)", async () => {
      const { seller, product } = await listingWithReferences();
      await deactivateAll();

      const res = await request(ctx.app.getHttpServer())
        .patch(path(product.id))
        .set(await auth(seller.id, seller))
        .send({
          price: 150,
          brandId: baseline.brandId,
          carModelId: modelId,
          manufacturerId: baseline.manufacturerId,
        })
        .expect(200);

      expect(res.body.manufacturer).toMatchObject({
        id: baseline.manufacturerId,
      });
      const row = await stored(product.id);
      expect(Number(row.price)).toBe(150);
      expect(row).toMatchObject({
        brandId: baseline.brandId,
        carModelId: modelId,
        manufacturerId: baseline.manufacturerId,
      });
    });

    it("saves a price change with a deactivated manufacturer and no model (carModelId null)", async () => {
      const { seller, product } = await listingWithReferences();
      const prisma = getPrisma();
      await prisma.product.update({
        where: { id: product.id },
        data: { carModelId: null },
      });
      await prisma.manufacturer.update({
        where: { id: baseline.manufacturerId },
        data: { isActive: false },
      });

      await request(ctx.app.getHttpServer())
        .patch(path(product.id))
        .set(await auth(seller.id, seller))
        .send({
          price: 150,
          brandId: baseline.brandId,
          carModelId: null,
          manufacturerId: baseline.manufacturerId,
        })
        .expect(200);

      const row = await stored(product.id);
      expect(Number(row.price)).toBe(150);
      expect(row.carModelId).toBeNull();
      expect(row.manufacturerId).toBe(baseline.manufacturerId);
    });

    it("saves the mobile payload (carModelId omitted) with deactivated references and keeps the model", async () => {
      const { seller, product } = await listingWithReferences();
      await deactivateAll();

      await request(ctx.app.getHttpServer())
        .patch(path(product.id))
        .set(await auth(seller.id, seller))
        .send({
          price: 150,
          brandId: baseline.brandId,
          manufacturerId: baseline.manufacturerId,
        })
        .expect(200);

      const row = await stored(product.id);
      expect(Number(row.price)).toBe(150);
      expect(row.carModelId).toBe(modelId);
    });

    it("clears the model on a brand change without carModelId (mobile 1.0.5-1.1.1)", async () => {
      const { seller, product } = await listingWithReferences();

      await request(ctx.app.getHttpServer())
        .patch(path(product.id))
        .set(await auth(seller.id, seller))
        .send({
          brandId: otherBrandId,
          manufacturerId: baseline.manufacturerId,
        })
        .expect(200);

      expect(await stored(product.id)).toMatchObject({
        brandId: otherBrandId,
        carModelId: null,
        manufacturerId: baseline.manufacturerId,
      });
    });

    it.each([
      ["clearing the brand", () => ({ brandId: null })],
      ["clearing the manufacturer", () => ({ manufacturerId: null })],
      [
        "a brand change that keeps the old brand's model",
        () => ({ brandId: otherBrandId, carModelId: modelId }),
      ],
    ])("refuses %s and writes nothing", async (_case, body) => {
      const { seller, product } = await listingWithReferences();

      const res = await request(ctx.app.getHttpServer())
        .patch(path(product.id))
        .set(await auth(seller.id, seller))
        .send({ price: 150, ...body() })
        .expect(400);

      expect(res.body.i18nKey).toBe(
        "server.product.invalidBrandModelManufacturer",
      );
      const row = await stored(product.id);
      expect(Number(row.price)).toBe(100);
      expect(row).toMatchObject({
        brandId: baseline.brandId,
        carModelId: modelId,
        manufacturerId: baseline.manufacturerId,
      });
    });

    it("refuses a brand change to a deactivated brand and writes nothing", async () => {
      const { seller, product } = await listingWithReferences();
      await getPrisma().brand.update({
        where: { id: otherBrandId },
        data: { isActive: false },
      });

      const res = await request(ctx.app.getHttpServer())
        .patch(path(product.id))
        .set(await auth(seller.id, seller))
        .send({ price: 150, brandId: otherBrandId, carModelId: null })
        .expect(400);

      expect(res.body.i18nKey).toBe(
        "server.product.invalidBrandModelManufacturer",
      );
      const row = await stored(product.id);
      expect(Number(row.price)).toBe(100);
      expect(row.brandId).toBe(baseline.brandId);
      expect(row.carModelId).toBe(modelId);
    });
  });
});
