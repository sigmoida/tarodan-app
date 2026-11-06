import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { MAX_REORDER_ITEMS, ReorderCollectionItemsDto } from "./collection.dto";

/** The reorder body is validated item by item (options as in `main.ts`). */
describe("ReorderCollectionItemsDto (real ValidationPipe)", () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const bind = (body: unknown) =>
    pipe.transform(body, {
      type: "body",
      metatype: ReorderCollectionItemsDto,
    }) as Promise<ReorderCollectionItemsDto>;

  const ID = "44444444-4444-4444-8444-444444444444";

  it("accepts uuid ids with non-negative integer sort orders", async () => {
    const dto = await bind({ items: [{ itemId: ID, sortOrder: 0 }] });
    expect(dto.items).toEqual([{ itemId: ID, sortOrder: 0 }]);
  });

  it("accepts an empty list", async () => {
    await expect(bind({ items: [] })).resolves.toEqual({ items: [] });
  });

  it.each([
    ["a non-uuid id", { items: [{ itemId: "x", sortOrder: 0 }] }],
    ["a missing id", { items: [{ sortOrder: 0 }] }],
    ["a negative sort order", { items: [{ itemId: ID, sortOrder: -1 }] }],
    ["a fractional sort order", { items: [{ itemId: ID, sortOrder: 1.5 }] }],
    ["a non-array", { items: "x" }],
    ["a non-object entry", { items: ["x"] }],
    [
      "too many entries",
      {
        items: Array.from({ length: MAX_REORDER_ITEMS + 1 }, (_, i) => ({
          itemId: ID,
          sortOrder: i,
        })),
      },
    ],
  ])("refuses %s", async (_label, body) => {
    await expect(bind(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
