import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { RefundBoostDto } from "./ad-package.dto";

/**
 * Boost refund amount: optional (empty refunds all), else a TL amount of at
 * least 0.01. `@IsNumber({ maxDecimalPlaces })` threw on 1e-7 and the pipe
 * answered 500; it is a 400 now, as for `ManualRefundDto`.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const asBody = (body: Record<string, unknown>) =>
  pipe.transform({ reason: "Duplicate boost charge refunded", ...body }, {
    type: "body",
    metatype: RefundBoostDto,
    data: "",
  } satisfies ArgumentMetadata) as Promise<RefundBoostDto>;

describe("RefundBoostDto amount", () => {
  it("leaves a missing amount missing (refund all)", async () => {
    const dto = await asBody({});
    expect(dto.amount).toBeUndefined();
  });

  it.each([0.01, 150, 150.5, 150.55])("accepts %p", async (amount) => {
    await expect(asBody({ amount })).resolves.toMatchObject({ amount });
  });

  it('converts the text "150.55"', async () => {
    await expect(asBody({ amount: "150.55" })).resolves.toMatchObject({
      amount: 150.55,
    });
  });

  it.each([150.555, 1e-7, 1e21, 0, -5, "abc"])(
    "refuses %p with 400",
    async (amount) => {
      await expect(asBody({ amount })).rejects.toMatchObject({ status: 400 });
    },
  );
});
