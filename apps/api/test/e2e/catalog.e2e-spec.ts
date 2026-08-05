import * as request from "supertest";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";

/**
 * Catalog module tests — Categories, Brands, Manufacturers, Car-Models, Tax, Pages.
 * All public/read-only endpoints.
 */
describe("Catalog (E2E)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };

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
  });

  // ─── Categories ───

  describe("GET /api/categories", () => {
    it("returns category list", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/categories")
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("does not silently drop an active category below an inactive parent", async () => {
      const prisma = getPrisma();
      const parent = await prisma.category.create({
        data: {
          name: "Inactive parent",
          slug: "inactive-parent",
          isActive: false,
        },
      });
      const child = await prisma.category.create({
        data: {
          name: "Active child",
          slug: "active-child",
          parentId: parent.id,
          isActive: true,
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .get("/api/categories?refresh=1")
        .expect(200);

      expect(res.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: child.id })]),
      );
    });
  });

  describe("GET /api/categories/:id", () => {
    it("returns category by ID", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/categories/${baseline.categoryId}`)
        .expect(200);

      expect(res.body.id).toBe(baseline.categoryId);
    });

    it("returns 404 for non-existent category", async () => {
      await request(ctx.app.getHttpServer())
        .get("/api/categories/00000000-0000-0000-0000-000000000000")
        .expect(404);
    });
  });

  describe("GET /api/categories/slug/:slug", () => {
    it("returns category by slug", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/categories/slug/test-category")
        .expect(200);

      expect(res.body.slug).toBe("test-category");
    });

    it("returns 404 for non-existent slug", async () => {
      await request(ctx.app.getHttpServer())
        .get("/api/categories/slug/nonexistent-slug")
        .expect(404);
    });
  });

  // ─── Brands ───

  describe("GET /api/brands", () => {
    it("returns brand list", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/brands")
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /api/brands/:slug", () => {
    it("returns brand by slug", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/brands/test-brand")
        .expect(200);

      expect(res.body.slug).toBe("test-brand");
    });

    it("returns 404 for non-existent brand", async () => {
      await request(ctx.app.getHttpServer())
        .get("/api/brands/nonexistent-brand")
        .expect(404);
    });
  });

  // ─── Manufacturers ───

  describe("GET /api/manufacturers", () => {
    it("returns manufacturer list", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/manufacturers")
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /api/manufacturers/slug/:slug", () => {
    it("returns manufacturer by slug", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/manufacturers/slug/test-manufacturer")
        .expect(200);

      expect(res.body.slug).toBe("test-manufacturer");
    });
  });

  // ─── Car Models ───

  describe("GET /api/car-models", () => {
    it("returns car model list", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/car-models")
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ─── Tax ───

  describe("GET /api/tax/calculate", () => {
    it("returns tax calculation", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/tax/calculate")
        .query({ country: "TR", subtotal: 100 })
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  // ─── Pages ───

  describe("GET /api/pages", () => {
    it("returns page list (may be empty)", async () => {
      const res = await request(ctx.app.getHttpServer())
        .get("/api/pages")
        .expect(200);

      expect(res.body).toBeTruthy();
    });
  });

  describe("GET /api/pages/:slug", () => {
    it("returns 404 for non-existent page", async () => {
      await request(ctx.app.getHttpServer())
        .get("/api/pages/nonexistent-page")
        .expect(404);
    });
  });
});
