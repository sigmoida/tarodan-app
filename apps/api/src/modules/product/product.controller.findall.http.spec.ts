import { INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import * as request from "supertest";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../common/validators/global-validation-pipe-options";
import { I18nService } from "../i18n/i18n.service";
import { ProductController } from "./product.controller";
import { ProductService } from "./product.service";
import { ProductBoostService } from "./ranking/product-boost.service";
import { BoostSellerService } from "./boost-seller/boost-seller.service";
import { BoostOfferService } from "./boost-seller/boost-offer.service";
import { ProductRenewalService } from "./lifecycle/product-renewal.service";

/**
 * `GET /products` over HTTP, with the real global exception filter and
 * validation pipe: the contract mobile and web see (contract delta
 * 2026-10-23-products-list-error-status).
 *
 * A failing list is a sanitised 500 (`{ statusCode, message, error,
 * i18nKey }`), never an empty 200 page, and never carries the internal
 * cause (host, SQL, stack) to the client. The cause is logged server-side
 * by the filter, which is the path that reports it to Sentry.
 */
describe("GET /products over HTTP", () => {
  let app: INestApplication;
  const findAll = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        { provide: ProductService, useValue: { findAll } },
        { provide: ProductBoostService, useValue: {} },
        { provide: BoostSellerService, useValue: {} },
        { provide: BoostOfferService, useValue: {} },
        { provide: ProductRenewalService, useValue: {} },
        I18nService,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let loggedError: jest.SpyInstance;
  beforeEach(() => {
    findAll.mockReset();
    loggedError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });
  afterEach(() => loggedError.mockRestore());

  const internalCause =
    "connect ECONNREFUSED 10.0.3.7:9200 at /app/dist/modules/search/query.js";

  it("answers a failing list with a sanitised 500, not an empty 200 page", async () => {
    findAll.mockRejectedValue(new Error(internalCause));

    const res = await request(app.getHttpServer())
      .get("/products")
      .query({ page: 1, limit: 12 })
      .set("accept-language", "en");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      statusCode: 500,
      message: "Server error",
      error: "Internal Server Error",
      i18nKey: "server.common.internalError",
    });
    expect(res.body).not.toHaveProperty("data");
    expect(res.text).not.toContain("ECONNREFUSED");
    expect(res.text).not.toContain("10.0.3.7");
    expect(res.text).not.toContain("/app/dist");
  });

  it("keeps a database error's detail out of the response", async () => {
    findAll.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Timed out fetching a new connection from the pool (table "products")',
        { code: "P2024", clientVersion: "5.x" },
      ),
    );

    const res = await request(app.getHttpServer()).get("/products");

    expect(res.status).toBe(500);
    expect(res.body.i18nKey).toBe("server.common.internalError");
    expect(res.text).not.toContain("P2024");
    expect(res.text).not.toContain("connection from the pool");
  });

  it("logs the cause server-side, the path that reports it to Sentry", async () => {
    findAll.mockRejectedValue(new Error(internalCause));

    await request(app.getHttpServer()).get("/products");

    expect(loggedError).toHaveBeenCalledWith(
      expect.stringContaining("-> 500"),
      expect.stringContaining(internalCause),
    );
  });

  it("keeps an empty result a 200 page", async () => {
    const empty = {
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    };
    findAll.mockResolvedValue(empty);

    const res = await request(app.getHttpServer()).get("/products");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(empty);
    expect(res.headers["cache-control"]).toBe(
      "no-store, no-cache, must-revalidate",
    );
    expect(loggedError).not.toHaveBeenCalled();
  });
});
