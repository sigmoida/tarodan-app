import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { CreateDiscountDto } from "./create-discount.dto";
import { UpdateDiscountDto } from "./update-discount.dto";

/**
 * Discount money fields stored in `Decimal(10, 2)` columns are bounded by the
 * column, so an amount it cannot hold is a 400 instead of a database 500.
 * Nothing else changes: a fixed amount above the cart is capped at checkout.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const base = {
  name: "Kampanya",
  type: "fixed_amount",
  value: 50,
  scope: "seller",
  startDate: "2026-01-01T00:00:00Z",
  endDate: "2026-12-31T23:59:59Z",
};

const asBody = (
  metatype: typeof CreateDiscountDto | typeof UpdateDiscountDto,
  body: object,
) =>
  pipe.transform(body, {
    type: "body",
    metatype,
    data: "",
  } satisfies ArgumentMetadata) as Promise<Partial<CreateDiscountDto>>;

describe.each([
  ["CreateDiscountDto", CreateDiscountDto, base],
  ["UpdateDiscountDto", UpdateDiscountDto, {}],
])("%s money bounds", (_name, metatype, rest) => {
  it.each(["value", "minCartValue", "maxDiscountAmount"])(
    "accepts %s at the column maximum",
    async (field) => {
      await expect(
        asBody(metatype, { ...rest, [field]: 99_999_999.99 }),
      ).resolves.toMatchObject({ [field]: 99_999_999.99 });
    },
  );

  it.each(["value", "minCartValue", "maxDiscountAmount"])(
    "refuses %s above the column maximum with 400",
    async (field) => {
      await expect(
        asBody(metatype, { ...rest, [field]: 100_000_000 }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );

  it("keeps converting text, as released clients rely on", async () => {
    await expect(
      asBody(metatype, { ...rest, value: "10000" }),
    ).resolves.toMatchObject({ value: 10000 });
  });
});
