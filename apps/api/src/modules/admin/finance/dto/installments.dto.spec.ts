import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../../common/validators/global-validation-pipe-options";
import { InstallmentOptionsDto } from "../../../payment/dto/installment-options.dto";
import {
  InstallmentPreviewQueryDto,
  InstallmentRuleDto,
  UpdateInstallmentSettingsDto,
} from "./installments.dto";

/**
 * The installment DTOs through the REAL global pipe options
 * (`enableImplicitConversion`): a text "false" must never become `true` (the
 * kill switch ON) and a text "" never 0 (a 0 TL minimum).
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

async function run<T>(
  metatype: new () => T,
  value: Record<string, unknown>,
  type: ArgumentMetadata["type"] = "body",
): Promise<T> {
  return (await pipe.transform(value, { type, metatype, data: "" })) as T;
}

const RULE = {
  name: "Premium",
  segment: "premium",
  minCount: 2,
  maxCount: 3,
  allowed: true,
  platformSharePct: 100,
  priority: 0,
  validFrom: "2026-11-01T00:00:00.000Z",
};

describe("installment DTOs under the global pipe", () => {
  it("takes JSON booleans and numbers as they are", async () => {
    expect(
      await run(UpdateInstallmentSettingsDto, {
        enabled: false,
        minAmount: 500,
      }),
    ).toEqual({
      enabled: false,
      minAmount: 500,
    });
    expect(
      await run(InstallmentRuleDto, {
        ...RULE,
        allowed: false,
        platformSharePct: 0,
      }),
    ).toMatchObject({
      allowed: false,
      platformSharePct: 0,
    });
  });

  it.each`
    case                 | body
    ${'enabled "false"'} | ${{ enabled: "false" }}
    ${'enabled "true"'}  | ${{ enabled: "true" }}
    ${"enabled 1"}       | ${{ enabled: 1 }}
    ${'minAmount ""'}    | ${{ minAmount: "" }}
    ${'minAmount "500"'} | ${{ minAmount: "500" }}
    ${"minAmount true"}  | ${{ minAmount: true }}
  `("refuses settings with $case (400)", async ({ body }) => {
    await expect(run(UpdateInstallmentSettingsDto, body)).rejects.toMatchObject(
      { status: 400 },
    );
  });

  it.each`
    field                 | value
    ${"allowed"}          | ${"false"}
    ${"platformSharePct"} | ${""}
    ${"minCount"}         | ${"2"}
    ${"priority"}         | ${true}
  `("refuses a rule with $field = $value (400)", async ({ field, value }) => {
    await expect(
      run(InstallmentRuleDto, { ...RULE, [field]: value }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("reads the preview query: draftAllowed=false stays false, numbers convert", async () => {
    const query = await run(
      InstallmentPreviewQueryDto,
      {
        segment: "premium",
        amount: "1000",
        family: "world",
        draftMinCount: "6",
        draftAllowed: "false",
      },
      "query",
    );
    expect(query).toMatchObject({
      amount: 1000,
      draftMinCount: 6,
      draftAllowed: false,
    });
    const absent = await run(
      InstallmentPreviewQueryDto,
      { segment: "premium", amount: "1000", family: "world" },
      "query",
    );
    expect(absent).not.toHaveProperty("draftAllowed");
  });

  it("refuses an `all` preview segment (a buyer always has their own segment)", async () => {
    await expect(
      run(
        InstallmentPreviewQueryDto,
        { segment: "all", amount: "1000", family: "world" },
        "query",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("takes the options amount as a JSON number only", async () => {
    expect(
      await run(InstallmentOptionsDto, { bin: "45467112", amount: 1000.5 }),
    ).toMatchObject({
      amount: 1000.5,
    });
    await expect(
      run(InstallmentOptionsDto, { bin: "45467112", amount: "1000" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      run(InstallmentOptionsDto, { bin: "45467112", amount: 10.005 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
