import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { CreateTradeDto } from "./create-trade.dto";
import { CounterTradeDto } from "./update-trade.dto";

/**
 * The trade DTOs only gate the type of `cashAmount`; its bounds are a service
 * check with a catalog key (`assertTradeCashAmount`). Pinned here: the pipe
 * never throws a 500 on an exponent form, keeps the sign, and still converts
 * text, which is the existing contract for released clients.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const body = {
  receiverId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  initiatorItems: [
    { productId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", quantity: 1 },
  ],
  receiverItems: [
    { productId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", quantity: 1 },
  ],
};

describe.each([
  ["CreateTradeDto", CreateTradeDto],
  ["CounterTradeDto", CounterTradeDto],
])("%s cashAmount", (_name, metatype) => {
  const asBody = (cashAmount: unknown) =>
    pipe.transform({ ...body, cashAmount }, {
      type: "body",
      metatype,
      data: "",
    } satisfies ArgumentMetadata) as Promise<{ cashAmount?: number }>;

  it.each([150.5, -150.5, 0, 1e-7, 59.999, 100_000_000])(
    "passes the number %p through unchanged (the service bounds it)",
    async (value) => {
      await expect(asBody(value)).resolves.toMatchObject({ cashAmount: value });
    },
  );

  it.each([
    ["150.5", 150.5],
    ["-150.5", -150.5],
  ])("converts the text %p to %p", async (raw, converted) => {
    await expect(asBody(raw)).resolves.toMatchObject({ cashAmount: converted });
  });

  it.each(["abc", Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %p with 400",
    async (value) => {
      await expect(asBody(value)).rejects.toMatchObject({ status: 400 });
    },
  );

  it("leaves a missing amount missing", async () => {
    const dto = await asBody(undefined);
    expect(dto.cashAmount).toBeUndefined();
  });
});
