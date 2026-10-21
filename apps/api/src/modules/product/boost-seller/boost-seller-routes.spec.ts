import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { IS_PUBLIC_KEY } from "../../auth/decorators/public.decorator";
import { ProductController } from "../product.controller";
import {
  BoostReminderDto,
  DismissBoostOffersDto,
  MyBoostsQueryDto,
} from "../dto/boost.dto";

/**
 * The seller's boost routes: signed in only (default closed, never
 * `@Public`), declared before the `:id` routes, and validated by their DTOs
 * through the global pipe before the service (ownership is the service's:
 * see boost-seller.service.spec and boost-offer.service.spec).
 */

const UUID = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";
const ROUTES = [
  "getMyBoosts",
  "getBoostOffers",
  "dismissBoostOffers",
  "setBoostReminder",
] as const;

/** Whether an Express route pattern (`:param` segments) matches a concrete path. */
const segments = (path: string) => path.split("/").filter(Boolean);
const catches = (pattern: string, path: string) => {
  const p = segments(pattern);
  const c = segments(path);
  return (
    p.length === c.length &&
    p.every((seg, i) => seg.startsWith(":") || seg === c[i])
  );
};

const handler = (method: keyof ProductController) =>
  ProductController.prototype[method] as unknown as object;

describe("ProductController boost seller routes", () => {
  it.each(ROUTES)("%s needs a session (never @Public)", (method) => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler(method))).toBeFalsy();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ProductController)).toBeFalsy();
  });

  it.each([
    ["getMyBoosts", "boost/my"],
    ["getBoostOffers", "boost/offers"],
    ["dismissBoostOffers", "boost/offers/dismiss"],
    ["setBoostReminder", ":id/boost/reminder"],
  ] as const)("%s is %s", (method, path) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler(method))).toBe(path);
  });

  it("no route declared earlier with the same method catches a boost route", () => {
    // Nest (Express) matches routes in declaration order: an earlier `:id`
    // route would read "boost" as a listing id. Each boost route's concrete
    // path is matched against every route declared before it.
    const routes = Object.getOwnPropertyNames(ProductController.prototype)
      .map((name) => {
        const fn = (
          ProductController.prototype as unknown as Record<string, unknown>
        )[name];
        return {
          name,
          path: Reflect.getMetadata(PATH_METADATA, fn as object) as
            string | undefined,
          method: Reflect.getMetadata(METHOD_METADATA, fn as object) as
            number | undefined,
        };
      })
      .filter((r): r is { name: string; path: string; method: number } =>
        Boolean(r.path),
      );
    for (const name of ROUTES) {
      const at = routes.findIndex((r) => r.name === name);
      expect(at).toBeGreaterThanOrEqual(0);
      const route = routes[at];
      const concrete = route.path.replace(/:[^/]+/g, UUID);
      const shadowing = routes
        .slice(0, at)
        .filter((r) => r.method === route.method && catches(r.path, concrete))
        .map((r) => r.name);
      expect({ name, shadowing }).toEqual({ name, shadowing: [] });
    }
  });

  it("the shadowing check catches a parameter route of the same length", () => {
    // Guards the check above against passing vacuously.
    expect(catches(":id", "boost")).toBe(true);
    expect(catches(":id/boost/:what", `${UUID}/boost/reminder`)).toBe(true);
    expect(catches(":id/stats", "boost/offers")).toBe(false);
    expect(catches(":id", "boost/my")).toBe(false);
  });
});

describe("boost seller DTOs through the global pipe", () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const run = <T>(
    metatype: new () => T,
    value: unknown,
    type: "body" | "query" = "body",
  ) =>
    pipe.transform(value, {
      type,
      metatype,
      data: "",
    } satisfies ArgumentMetadata) as Promise<T>;

  describe("MyBoostsQueryDto", () => {
    it("parses state, page and limit from the query string", async () => {
      const dto = await run(
        MyBoostsQueryDto,
        { state: "history", page: "2", limit: "10" },
        "query",
      );
      expect({ ...dto }).toEqual({ state: "history", page: 2, limit: 10 });
    });

    it.each([
      [{ state: "pending" }],
      [{ state: "all" }],
      [{ limit: "101" }],
      [{ page: "0" }],
    ])("refuses %j", async (query) => {
      await expect(run(MyBoostsQueryDto, query, "query")).rejects.toThrow();
    });
  });

  describe("BoostReminderDto", () => {
    it.each([true, false])("takes the JSON boolean %s", async (enabled) => {
      await expect(run(BoostReminderDto, { enabled })).resolves.toMatchObject({
        enabled,
      });
    });

    it.each([[{}], [{ enabled: "false" }], [{ enabled: 1 }]])(
      'refuses %j (the text "false" is never read as true)',
      async (body) => {
        await expect(run(BoostReminderDto, body)).rejects.toThrow();
      },
    );
  });

  describe("DismissBoostOffersDto", () => {
    it("takes 1 to 20 listing UUIDs", async () => {
      const dto = await run(DismissBoostOffersDto, { productIds: [UUID] });
      expect(dto.productIds).toEqual([UUID]);
    });

    it.each([
      ["no ids", { productIds: [] }],
      ["more than 20", { productIds: Array.from({ length: 21 }, () => UUID) }],
      ["a non-UUID", { productIds: ["p1"] }],
      ["not a list", { productIds: UUID }],
    ])("refuses %s", async (_name, body) => {
      await expect(run(DismissBoostOffersDto, body)).rejects.toThrow();
    });
  });
});
