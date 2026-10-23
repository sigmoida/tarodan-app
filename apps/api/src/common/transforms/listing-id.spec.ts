import { ValidationPipe } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../validators/global-validation-pipe-options";
import { ListingIdField, toListingId } from "./listing-id";

const ID = "0b1e7a52-3c4d-4e5f-8a9b-1c2d3e4f5ac9";

describe("toListingId", () => {
  it("resolves a bare uuid or a listing segment to the lower-case uuid", () => {
    expect(toListingId(ID)).toBe(ID);
    expect(toListingId(ID.toUpperCase())).toBe(ID);
    expect(toListingId(`ferrari-f40-${ID}`)).toBe(ID);
  });

  it("returns anything else unchanged for the caller's own check", () => {
    expect(toListingId("ferrari-f40")).toBe("ferrari-f40");
    expect(toListingId("")).toBe("");
    expect(toListingId(42)).toBe(42);
    expect(toListingId(undefined)).toBeUndefined();
    expect(toListingId(null)).toBeNull();
  });
});

class ProductBody {
  @ListingIdField()
  @IsUUID("4")
  productId!: string;
}

class TargetBody {
  type!: string;

  @ListingIdField((body) => body.type === "product")
  @IsUUID()
  targetId!: string;
}

describe("ListingIdField under the global ValidationPipe", () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const asBody = <T>(metatype: new () => T, value: unknown) =>
    pipe.transform(value, { type: "body", metatype }) as Promise<T>;

  it("normalises before the field's own UUID validator runs", async () => {
    await expect(
      asBody(ProductBody, { productId: `ferrari-${ID}` }),
    ).resolves.toMatchObject({ productId: ID });
  });

  it("leaves garbage to the validator: 400", async () => {
    await expect(
      asBody(ProductBody, { productId: "ferrari-f40" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("applies only when the `when` predicate holds", async () => {
    await expect(
      asBody(TargetBody, { type: "product", targetId: `x-${ID}` }),
    ).resolves.toMatchObject({ targetId: ID });
    await expect(
      asBody(TargetBody, { type: "user", targetId: `x-${ID}` }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
