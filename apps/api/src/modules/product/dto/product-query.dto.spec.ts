import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { SEARCH_PRICE_MAX } from "@tarodan/types";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { ProductQueryDto } from "./product-query.dto";

/**
 * `GET /products` price bounds: both take 0 up to `SEARCH_PRICE_MAX`, the
 * bound web and mobile keep their searches within (a larger typed or URL
 * bound is never sent). The query arrives as text and is converted.
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

    it.each([String(SEARCH_PRICE_MAX + 0.01), String(SEARCH_PRICE_MAX + 1)])(
      "refuses %p (above SEARCH_PRICE_MAX) with 400",
      async (raw) => {
        await expect(asQuery({ [field]: raw })).rejects.toMatchObject({
          status: 400,
        });
      },
    );
  },
);

describe("ProductQueryDto price bounds", () => {
  it("are capped by the shared search constant", () => {
    expect(SEARCH_PRICE_MAX).toBe(9_999_999);
  });

  it("refuses a negative minPrice with 400", async () => {
    await expect(asQuery({ minPrice: "-1" })).rejects.toMatchObject({
      status: 400,
    });
  });
});
