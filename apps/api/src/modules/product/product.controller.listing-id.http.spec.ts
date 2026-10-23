import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  INestApplication,
  PipeTransform,
  ValidationPipe,
} from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import type { NextFunction, Request, Response } from "express";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { RouteParamSafetyPipe } from "../../common/pipes/route-param-safety.pipe";
import { ListingIdPipe } from "../../common/pipes/listing-id.pipe";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../common/validators/global-validation-pipe-options";
import { JwtAuthGuard } from "../auth";
import { I18nService } from "../i18n/i18n.service";
import { ProductController } from "./product.controller";
import { ProductService } from "./product.service";
import { ProductBoostService } from "./ranking/product-boost.service";
import { BoostSellerService } from "./boost-seller/boost-seller.service";
import { BoostOfferService } from "./boost-seller/boost-offer.service";
import { ProductRenewalService } from "./lifecycle/product-renewal.service";
import { RatingController } from "../rating/rating.controller";
import { RatingService } from "../rating/rating.service";
import { WishlistController } from "../wishlist/wishlist.controller";
import { WishlistService } from "../wishlist/wishlist.service";

/**
 * Listing URL segments on the product id routes, over HTTP with the real
 * exception filter and global pipes (contract delta
 * 2026-10-23-listing-slug-param, ADR 0017).
 *
 * Live apps (iOS 1.0.5, 1.1.x without the parser OTA) route a
 * `/listings/<slug>-<uuid>` link to their product screen and send the whole
 * segment wherever that screen, or the edit screen of `/listings/<seg>/edit`,
 * uses the product id. Every product id route resolves it, so the service only
 * ever sees the lower-case UUID; anything else is a 400 with the route's
 * catalog key, and ids that are not product ids stay strict.
 */
describe("listing id params over HTTP", () => {
  const ID = "0b1e7a52-3c4d-4e5f-8a9b-1c2d3e4f5ac9";
  const SEGMENT = `ferrari-f40-1-18-bburago-kirmizi-${ID}`;
  const USER_ID = "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e01";

  let app: INestApplication;
  const product = {
    findOne: jest.fn(),
    findSimilarProducts: jest.fn(),
    incrementViewCount: jest.fn(),
    findMyProductById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    likeProduct: jest.fn(),
  };
  const rating = {
    getProductRatings: jest.fn(),
    getProductRatingStats: jest.fn(),
    markProductRatingHelpful: jest.fn(),
  };
  const wishlist = {
    removeFromWishlist: jest.fn(),
    isInWishlist: jest.fn(),
  };

  /** Stands in for the JWT guard on `GET /products/my/:id`. */
  const signedIn: CanActivate = {
    canActivate: (ctx: ExecutionContext) => {
      ctx.switchToHttp().getRequest().user = { id: USER_ID };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductController, RatingController, WishlistController],
      providers: [
        { provide: ProductService, useValue: product },
        { provide: ProductBoostService, useValue: {} },
        { provide: BoostSellerService, useValue: {} },
        { provide: BoostOfferService, useValue: {} },
        { provide: ProductRenewalService, useValue: {} },
        { provide: RatingService, useValue: rating },
        { provide: WishlistService, useValue: wishlist },
        I18nService,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(signedIn)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    // Stands in for the global JWT guard on routes without their own guard.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (req.headers["x-test-user"]) {
        (req as Request & { user?: unknown }).user = { id: USER_ID };
      }
      next();
    });
    // The same global pipes, in the same order, as main.ts.
    app.useGlobalPipes(
      new RouteParamSafetyPipe(),
      new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const fn of [
      ...Object.values(product),
      ...Object.values(rating),
      ...Object.values(wishlist),
    ]) {
      fn.mockReset().mockResolvedValue({ ok: true });
    }
  });

  const http = () => request(app.getHttpServer());

  describe("GET /products/:id", () => {
    it.each([
      ["a bare uuid", ID],
      ["a slug segment", SEGMENT],
      ["a stale slug", `old-title-${ID}`],
      // Express decodes the path: a raw Turkish prefix still resolves.
      ["a percent-encoded prefix", `k%C4%B1rm%C4%B1z%C4%B1-${ID}`],
      // Ids are stored lower case: an upper-cased link still resolves.
      ["an upper-case uuid", ID.toUpperCase()],
      ["an upper-case segment", `FERRARI-${ID.toUpperCase()}`],
    ])("resolves %s to the uuid", async (_label, param) => {
      const res = await http().get(`/products/${param}`);

      expect(res.status).toBe(200);
      expect(product.findOne).toHaveBeenCalledWith(ID, null);
    });

    it.each([
      ["garbage", "123"],
      ["an empty prefix", `-${ID}`],
      ["a slug without a uuid", "ferrari-f40"],
      ["a uuid followed by a slug", `${ID}-ferrari`],
      ["a truncated uuid", `ferrari-${ID.slice(0, 35)}`],
    ])("rejects %s with the route's 400", async (_label, param) => {
      const res = await http()
        .get(`/products/${param}`)
        .set("accept-language", "en");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        error: "Bad Request",
        i18nKey: "server.product.invalidIdFormatDetailed",
      });
      expect(product.findOne).not.toHaveBeenCalled();
    });
  });

  it("GET /products/:id/similar takes a slug segment", async () => {
    const res = await http().get(`/products/${SEGMENT}/similar?limit=6`);

    expect(res.status).toBe(200);
    expect(product.findSimilarProducts).toHaveBeenCalledWith(ID, 6, null);
  });

  it("POST /products/:id/view counts the view against the uuid", async () => {
    const res = await http().post(`/products/${SEGMENT}/view`);

    expect(res.status).toBe(201);
    expect(product.incrementViewCount.mock.calls[0][0]).toBe(ID);
  });

  it("GET /products/my/:id (owner fallback) takes a slug segment", async () => {
    const res = await http().get(`/products/my/${SEGMENT}`);

    expect(res.status).toBe(200);
    expect(product.findMyProductById).toHaveBeenCalledWith(ID, USER_ID);
  });

  it("keeps each route's own 400 for garbage", async () => {
    const similar = await http().get("/products/ferrari-f40/similar");
    expect(similar.status).toBe(400);
    expect(similar.body.i18nKey).toBe("server.product.invalidIdFormat");

    const view = await http().post("/products/ferrari-f40/view");
    expect(view.status).toBe(400);
    expect(view.body.i18nKey).toBe("server.product.invalidIdFormat");

    // Was Nest's untranslated "Validation failed (uuid is expected)".
    const mine = await http().get("/products/my/ferrari-f40");
    expect(mine.status).toBe(400);
    expect(mine.body.i18nKey).toBe("server.common.invalidId");
  });

  it("keeps the global route-param guard in front of the slug parse", async () => {
    // Over-long or control-character segments stop before the listing pipe.
    const long = await http().get(`/products/${"a".repeat(1000)}-${ID}`);
    expect(long.status).toBe(400);
    expect(long.body.i18nKey).toBe("server.common.invalidRouteParam");

    const nul = await http().get(`/products/ferrari%00-${ID}`);
    expect(nul.status).toBe(400);
    expect(nul.body.i18nKey).toBe("server.common.invalidRouteParam");
    expect(product.findOne).not.toHaveBeenCalled();
  });

  describe("GET /ratings/products/:productId", () => {
    it("resolves a slug segment for the list and the stats", async () => {
      const list = await http().get(`/ratings/products/${SEGMENT}?page=2`);
      const stats = await http().get(`/ratings/products/${SEGMENT}/stats`);

      expect(list.status).toBe(200);
      expect(rating.getProductRatings.mock.calls[0][0]).toBe(ID);
      expect(stats.status).toBe(200);
      expect(rating.getProductRatingStats).toHaveBeenCalledWith(ID);
    });

    it("rejects garbage with the common invalid-id 400", async () => {
      const res = await http().get("/ratings/products/ferrari-f40/stats");

      expect(res.status).toBe(400);
      expect(res.body.i18nKey).toBe("server.common.invalidId");
      expect(rating.getProductRatingStats).not.toHaveBeenCalled();
    });
  });

  describe("every product id route of ProductController", () => {
    /**
     * The pipes Nest runs on each handler's `:id` route parameter. Route
     * params are keyed `<RouteParamtypes.PARAM>:<index>`; this skips custom
     * decorators such as `@CurrentUser("id")`.
     */
    const idParams = Object.getOwnPropertyNames(ProductController.prototype)
      .map((handler) => {
        const args: Record<string, { data?: string; pipes: PipeTransform[] }> =
          Reflect.getMetadata(
            ROUTE_ARGS_METADATA,
            ProductController,
            handler,
          ) ?? {};
        const id = Object.entries(args).find(
          ([key, arg]) =>
            key.startsWith(`${RouteParamtypes.PARAM}:`) && arg.data === "id",
        )?.[1];
        return id ? ([handler, id.pipes] as const) : null;
      })
      .filter((entry) => entry !== null);

    it("covers the routes an old product or edit screen calls", () => {
      const handlers = idParams.map(([handler]) => handler);
      expect(handlers).toEqual(
        expect.arrayContaining([
          "findOne",
          "findMyProductById",
          "getSimilar",
          "incrementViewCount",
          "update",
          "remove",
          "likeProduct",
          "unlikeProduct",
          "renew",
          "initiateBoost",
          "getBoostOptions",
          "setBoostReminder",
          "incrementClickCount",
          "getProductStats",
          "isProductLiked",
        ]),
      );
    });

    it.each(idParams)(
      "%s resolves a segment and still refuses garbage",
      async (_handler, pipes) => {
        const meta = { type: "param", data: "id" } as const;
        expect(pipes).toHaveLength(1);
        expect(pipes[0]).toBeInstanceOf(ListingIdPipe);
        await expect(pipes[0].transform(SEGMENT, meta)).resolves.toBe(ID);
        await expect(pipes[0].transform(ID, meta)).resolves.toBe(ID);
        await expect(
          pipes[0].transform("ferrari-f40", meta),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );
  });

  describe("writes from an old product or edit screen", () => {
    it("PATCH /products/:id (edit save, reactivate) updates the uuid", async () => {
      const res = await http()
        .patch(`/products/${SEGMENT}`)
        .send({ status: "active", quantity: 1 });

      expect(res.status).toBe(200);
      expect(product.update.mock.calls[0].slice(0, 2)).toEqual([ID, USER_ID]);
    });

    it("DELETE /products/:id (edit screen) removes the uuid", async () => {
      const res = await http().delete(`/products/${SEGMENT}`);

      expect(res.status).toBe(200);
      expect(product.remove.mock.calls[0].slice(0, 2)).toEqual([ID, USER_ID]);
    });

    it("POST /products/:id/like takes a segment", async () => {
      const res = await http().post(`/products/${SEGMENT}/like`);

      expect(res.status).toBe(201);
      expect(product.likeProduct).toHaveBeenCalledWith(ID, USER_ID);
    });

    it("rejects garbage on a write route with its 400", async () => {
      const res = await http().patch("/products/ferrari-f40").send({});

      expect(res.status).toBe(400);
      expect(res.body.i18nKey).toBe("server.product.invalidIdFormat");
      expect(product.update).not.toHaveBeenCalled();
    });

    it("DELETE /wishlist/:productId (favourite off) takes a segment", async () => {
      const res = await http()
        .delete(`/wishlist/${SEGMENT}`)
        .set("x-test-user", "1");

      expect(res.status).toBe(204);
      expect(wishlist.removeFromWishlist).toHaveBeenCalledWith(USER_ID, ID);
    });

    it("GET /wishlist/check/:productId takes a segment", async () => {
      const res = await http()
        .get(`/wishlist/check/${SEGMENT}`)
        .set("x-test-user", "1");

      expect(res.status).toBe(200);
      expect(wishlist.isInWishlist).toHaveBeenCalledWith(USER_ID, ID);
    });

    it("rejects a garbage wishlist id with the common invalid-id 400", async () => {
      const res = await http()
        .delete("/wishlist/ferrari-f40")
        .set("x-test-user", "1");

      expect(res.status).toBe(400);
      expect(res.body.i18nKey).toBe("server.common.invalidId");
      expect(wishlist.removeFromWishlist).not.toHaveBeenCalled();
    });
  });

  it("keeps a rating id strict: no segment on the helpful route", async () => {
    const res = await http().post(`/ratings/products/${SEGMENT}/helpful`);

    expect(res.status).toBe(400);
    expect(rating.markProductRatingHelpful).not.toHaveBeenCalled();
  });
});
