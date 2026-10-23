import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { CreateOfferDto } from "./create-offer.dto";
import { CounterOfferDto } from "./counter-offer.dto";

/**
 * Offer and counter-offer amounts: a TL amount (at most two decimals) from 1
 * to 9,999,999. `@IsNumber({ maxDecimalPlaces })` threw on an exponent form
 * (a 500); a third decimal is now a 400 instead of being rounded by the
 * `Decimal(10, 2)` column. Text is still converted: the existing contract.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

describe.each([
  [
    "CreateOfferDto",
    CreateOfferDto,
    { productId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" },
  ],
  ["CounterOfferDto", CounterOfferDto, {}],
])("%s amount", (_name, metatype, rest) => {
  const asBody = (amount: unknown) =>
    pipe.transform({ ...rest, amount }, {
      type: "body",
      metatype,
      data: "",
    } satisfies ArgumentMetadata) as Promise<{ amount: number }>;

  it.each([1, 250, 250.5, 250.55, 9_999_999])("accepts %p", async (amount) => {
    await expect(asBody(amount)).resolves.toMatchObject({ amount });
  });

  it.each([
    ["250.55", 250.55],
    ["1000", 1000],
  ])("converts the text %p to %p", async (raw, converted) => {
    await expect(asBody(raw)).resolves.toMatchObject({ amount: converted });
  });

  it.each([
    // A third decimal, as a number and as text.
    250.555,
    "250.555",
    // Exponent forms: a 400, never a 500.
    1e-7,
    1e21,
    // Out of range and below zero, also just past either bound.
    0.5,
    0.99,
    9_999_999.01,
    10_000_000,
    -250,
    // Not a number.
    "abc",
    Number.NaN,
  ])("refuses %p with 400", async (amount) => {
    await expect(asBody(amount)).rejects.toMatchObject({ status: 400 });
  });
});
