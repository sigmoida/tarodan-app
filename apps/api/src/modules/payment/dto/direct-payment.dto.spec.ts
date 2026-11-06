import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { DirectPaymentDto } from "./direct-payment.dto";

/**
 * `direct-form` -> `installment` shape (ADR 0019). Run through the global
 * pipe settings, so the implicit conversion the API really uses is in play:
 * a malformed count, BIN or total is a 400 here, and the PayTR client's own
 * count and card checks stay programming guards that no request reaches.
 */
describe("DirectPaymentDto.installment", () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const parse = (installment: unknown) =>
    pipe.transform(
      { orderId: "f5e5e66d-c646-4b14-8ae7-85aa6de9be35", installment },
      { type: "body", metatype: DirectPaymentDto },
    ) as Promise<DirectPaymentDto>;

  it("is optional: an old client sends nothing", async () => {
    const dto = await parse(undefined);
    expect(dto.installment).toBeUndefined();
  });

  it.each`
    case                         | installment
    ${"a single payment"}        | ${{ count: 1, expectedTotal: 1000 }}
    ${"3 with a new card's BIN"} | ${{ count: 3, bin: "45467112", expectedTotal: 1066.38 }}
    ${"12 with a 6-digit BIN"}   | ${{ count: 12, bin: "454671", expectedTotal: 1200.12 }}
    ${"3 for a saved card"}      | ${{ count: 3, expectedTotal: 1066.38 }}
  `("accepts $case", async ({ installment }) => {
    const dto = await parse(installment);
    expect(dto.installment).toMatchObject(installment);
  });

  it.each`
    case                             | installment
    ${"count 0"}                     | ${{ count: 0, expectedTotal: 1000 }}
    ${"count 13"}                    | ${{ count: 13, expectedTotal: 1000 }}
    ${"a fractional count"}          | ${{ count: 2.5, expectedTotal: 1000 }}
    ${"a count sent as text"}        | ${{ count: "3", expectedTotal: 1066.38 }}
    ${"no count"}                    | ${{ expectedTotal: 1000 }}
    ${"no expected total"}           | ${{ count: 3 }}
    ${"a total of three decimals"}   | ${{ count: 3, expectedTotal: 1066.385 }}
    ${"a total sent as text"}        | ${{ count: 3, expectedTotal: "1066.38" }}
    ${"a zero total"}                | ${{ count: 3, expectedTotal: 0 }}
    ${"a negative total"}            | ${{ count: 3, expectedTotal: -1 }}
    ${"a 9-digit BIN"}               | ${{ count: 3, bin: "454671123", expectedTotal: 1066.38 }}
    ${"a whole card number"}         | ${{ count: 3, bin: "4355084355084358", expectedTotal: 1066.38 }}
    ${"a 5-digit BIN"}               | ${{ count: 3, bin: "45467", expectedTotal: 1066.38 }}
    ${"a BIN with a space"}          | ${{ count: 3, bin: "4546 7112", expectedTotal: 1066.38 }}
    ${"a BIN sent as an object"}     | ${{ count: 3, bin: { a: 1 }, expectedTotal: 1066.38 }}
    ${"an installment that is text"} | ${"3"}
  `("refuses $case with 400", async ({ installment }) => {
    await expect(parse(installment)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("drops undeclared fields (the card itself never travels in it)", async () => {
    const dto = await parse({
      count: 3,
      bin: "45467112",
      expectedTotal: 1066.38,
      cardNumber: "4355084355084358",
    });
    expect(dto.installment).not.toHaveProperty("cardNumber");
  });
});
