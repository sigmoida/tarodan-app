import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { SEARCH_PRICE_MAX } from "@tarodan/types";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { ProductQueryDto } from "./product-query.dto";

/**
 * `GET /products` price bounds. `maxPrice` is capped at `SEARCH_PRICE_MAX`,
 * the bound web and mobile keep their searches within (a larger typed or URL
 * bound is never sent). `minPrice` is not capped: released mobile builds may
 * send a larger one and must keep getting an empty list, not a 400. The query
 * arrives as text and is converted.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const asQuery = (query: Record<string, unknown>) =>
  pipe.transform(query, {
    type: "query",
    metatype: ProductQueryDto,
    data: "",
  } satisfies ArgumentMetadata) as Promise<ProductQueryDto>;

describe.each(["minPrice", "maxPrice"] as const)(
  "ProductQueryDto %s",
  (field) => {
    it.each([
      ["0", 0],
      ["1250.5", 1250.5],
      [String(SEARCH_PRICE_MAX), SEARCH_PRICE_MAX],
    ])("accepts %p as %p", async (raw, value) => {
      await expect(asQuery({ [field]: raw })).resolves.toMatchObject({
        [field]: value,
      });
    });
  },
);

describe("ProductQueryDto maxPrice", () => {
  it.each([String(SEARCH_PRICE_MAX + 0.01), String(SEARCH_PRICE_MAX + 1)])(
    "refuses %p (above SEARCH_PRICE_MAX) with 400",
    async (raw) => {
      await expect(asQuery({ maxPrice: raw })).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});

describe("ProductQueryDto minPrice", () => {
  it("takes a bound above SEARCH_PRICE_MAX (released clients, empty list)", async () => {
    await expect(
      asQuery({ minPrice: String(SEARCH_PRICE_MAX + 1) }),
    ).resolves.toMatchObject({ minPrice: SEARCH_PRICE_MAX + 1 });
  });

  it("refuses a negative bound with 400", async () => {
    await expect(asQuery({ minPrice: "-1" })).rejects.toMatchObject({
      status: 400,
    });
  });
});
