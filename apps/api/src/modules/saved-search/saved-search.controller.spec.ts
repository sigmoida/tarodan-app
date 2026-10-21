import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../common/validators/global-validation-pipe-options";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator";
import { canonicalizeSavedSearchQuery } from "@tarodan/types";
import { CreateSavedSearchDto, SavedSearchListQueryDto } from "./dto";
import { savedSearchQueryHash } from "./helpers/saved-search-hash";
import { SavedSearchController } from "./saved-search.controller";

const THROTTLER_LIMIT_DEFAULT = "THROTTLER:LIMITdefault";
const THROTTLER_TTL_DEFAULT = "THROTTLER:TTLdefault";
const UUID = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";

const handler = (method: keyof SavedSearchController) =>
  SavedSearchController.prototype[method] as unknown as object;

describe("SavedSearchController contract", () => {
  it.each(["list", "create", "remove"] as const)(
    "%s needs a session (default closed, never @Public)",
    (method) => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler(method))).toBeFalsy();
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, SavedSearchController),
      ).toBeFalsy();
    },
  );

  it.each([
    ["create", 20],
    ["remove", 30],
  ] as const)("throttles %s to %i per minute", (method, limit) => {
    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, handler(method))).toBe(
      limit,
    );
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, handler(method))).toBe(
      60000,
    );
  });
});

describe("CreateSavedSearchDto through the global pipe", () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const asBody = (body: unknown) =>
    pipe.transform(body, {
      type: "body",
      metatype: CreateSavedSearchDto,
      data: "",
    } satisfies ArgumentMetadata) as Promise<CreateSavedSearchDto>;

  it("drops keys outside the allow-list before the service", async () => {
    const dto = await asBody({
      query: {
        search: "f40",
        page: 2,
        limit: 48,
        sellerId: UUID,
        status: "sold",
        boostedOnly: true,
      },
    });
    expect({ ...dto.query }).toEqual({ search: "f40" });
  });

  it("parses flags and numbers like GET /products", async () => {
    const dto = await asBody({
      query: { tradeOnly: "true", preOrder: "false", minPrice: "100" },
    });
    expect(dto.query.tradeOnly).toBe(true);
    expect(dto.query.preOrder).toBe(false);
    expect(dto.query.minPrice).toBe(100);
  });

  it("gives the stored form and hash of the plain query, whatever the value types", async () => {
    // The service canonicalises the pipe's output (a DTO instance), not the
    // raw body: a client sending strings must not get a second, distinct row.
    const plain = {
      search: "f40",
      tradeOnly: true,
      minPrice: 100,
      maxPrice: 0,
      color: "red,black",
      attrGroups: '{"hw-rarity":["th"]}',
    };
    const typed = await asBody({ query: plain });
    const strings = await asBody({
      query: {
        ...plain,
        tradeOnly: "true",
        minPrice: "100",
        maxPrice: "0",
        preOrder: "false",
      },
    });

    const expected = canonicalizeSavedSearchQuery(plain);
    expect(canonicalizeSavedSearchQuery(typed.query)).toEqual(expected);
    expect(canonicalizeSavedSearchQuery(strings.query)).toEqual(expected);
    expect(
      savedSearchQueryHash(canonicalizeSavedSearchQuery(strings.query)),
    ).toBe(savedSearchQueryHash(expected));
  });

  it.each([
    ["a bad category UUID", { categoryId: "not-a-uuid" }],
    ["a bad car model UUID", { carModelId: "x" }],
    ["maxPrice over the GET /products cap", { maxPrice: 10000000 }],
    ["a negative minPrice", { minPrice: -1 }],
    ["an unknown condition", { condition: "broken" }],
    ["an over-long search text", { search: "x".repeat(201) }],
  ])("refuses %s with 400", async (_case, query) => {
    await expect(asBody({ query })).rejects.toMatchObject({ status: 400 });
  });

  it("takes attrGroups as an object or its JSON text, as the same search", async () => {
    // Implicit conversion alone would make the object "[object Object]",
    // which the canonical form drops as malformed JSON: a broader search.
    const asObject = await asBody({
      query: { search: "x", attrGroups: { "hw-rarity": ["th", "sth"] } },
    });
    const asText = await asBody({
      query: { search: "x", attrGroups: '{"hw-rarity":["sth","th"]}' },
    });
    const canonical = canonicalizeSavedSearchQuery(asObject.query);
    expect(canonical.attrGroups).toBe('{"hw-rarity":["sth","th"]}');
    expect(savedSearchQueryHash(canonical)).toBe(
      savedSearchQueryHash(canonicalizeSavedSearchQuery(asText.query)),
    );
  });

  it("refuses attrGroups sent as an array, with a clear message", async () => {
    const refusal = asBody({ query: { search: "x", attrGroups: ["th"] } });
    await expect(refusal).rejects.toMatchObject({ status: 400 });
    await expect(refusal).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          "query.attrGroups must be a group -> slugs object or its JSON text",
        ]),
      },
    });
  });

  it("caps attrGroups sent as an object by its JSON text", async () => {
    await expect(
      asBody({
        query: { search: "x", attrGroups: { g: ["s".repeat(2000)] } },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    "search",
    "brandId",
    "brand",
    "manufacturer",
    "scale",
    "material",
    "color",
    "sortBy",
  ])("refuses an object as %s instead of storing its text", async (key) => {
    await expect(
      asBody({ query: { search: "x", [key]: { a: 1 } } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("reads a number in a text filter as text, as a query string would", async () => {
    const dto = await asBody({ query: { search: 1, scale: 18 } });
    expect({ ...dto.query }).toEqual({ search: "1", scale: "18" });
  });

  it("counts the storage caps in code points, a variation selector not at all", async () => {
    // 200 single-code-point emoji are 400 UTF-16 units: within the cap.
    await expect(
      asBody({ query: { search: "🏎".repeat(200) } }),
    ).resolves.toBeDefined();
    await expect(
      asBody({ query: { search: "🏎️".repeat(200) } }),
    ).resolves.toBeDefined();
    await expect(
      asBody({ query: { search: "🏎".repeat(201) } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires a query object", async () => {
    await expect(asBody({})).rejects.toMatchObject({ status: 400 });
    await expect(asBody({ query: "search=x" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("trims the name and caps it at 60 characters", async () => {
    const dto = await asBody({ name: "  My hunt  ", query: { search: "x" } });
    expect(dto.name).toBe("My hunt");
    await expect(
      asBody({ name: "x".repeat(61), query: { search: "x" } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("counts the name in code points, as the labels and default name do", async () => {
    // 60 emoji are 120 UTF-16 units: still within the cap.
    const name = "🏎".repeat(60);
    await expect(
      asBody({ name, query: { search: "x" } }),
    ).resolves.toMatchObject({ name });
    await expect(
      asBody({ name: "🏎".repeat(61), query: { search: "x" } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ["an array", ["Diecast"]],
    ["a non-string value", { categoryId: 5 }],
    ["an over-long value", { categoryId: "x".repeat(81) }],
    [
      "more than 20 entries",
      Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"])),
    ],
  ])("refuses labels that are %s", async (_case, labels) => {
    await expect(
      asBody({ query: { search: "x" }, labels }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts null labels, padding and 80 characters of emoji", async () => {
    const dto = await asBody({
      query: { search: "x" },
      labels: {
        search: `  ${"🏎".repeat(80)}  `,
        carModelId: null,
      },
    });
    expect(dto.labels?.carModelId).toBeNull();
  });

  it("caps the list page size at 100", async () => {
    const list = (query: unknown) =>
      pipe.transform(query, {
        type: "query",
        metatype: SavedSearchListQueryDto,
        data: "",
      });
    await expect(list({ limit: "100" })).resolves.toEqual({ limit: 100 });
    await expect(list({ limit: "101" })).rejects.toMatchObject({ status: 400 });
  });
});
