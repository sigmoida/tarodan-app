import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { RouteParamSafetyPipe } from "../../common/pipes/route-param-safety.pipe";
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

/**
 * Listing URL segments on the listing read routes, over HTTP with the real
 * exception filter and global pipes (contract delta
 * 2026-10-23-listing-slug-param, ADR 0017).
 *
 * Live apps send the whole `/listings/<slug>-<uuid>` segment of a deep link
 * to the API. The read routes a product screen calls resolve it to the UUID,
 * so the service only ever sees the lower-case UUID; anything else is a 400
 * with the route's catalog key.
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
  };
  const rating = {
    getProductRatings: jest.fn(),
    getProductRatingStats: jest.fn(),
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
      controllers: [ProductController, RatingController],
      providers: [
        { provide: ProductService, useValue: product },
        { provide: ProductBoostService, useValue: {} },
        { provide: BoostSellerService, useValue: {} },
        { provide: BoostOfferService, useValue: {} },
        { provide: ProductRenewalService, useValue: {} },
        { provide: RatingService, useValue: rating },
        I18nService,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(signedIn)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
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
    for (const fn of [...Object.values(product), ...Object.values(rating)]) {
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

  it("leaves write routes on a bare-uuid contract", async () => {
    const res = await http().post(`/products/${SEGMENT}/like`);

    expect(res.status).toBe(400);
    expect(res.body.i18nKey).toBe("server.product.invalidIdFormat");
  });
});
