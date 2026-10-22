import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { IsNumber, IsOptional } from "class-validator";
import { Type } from "class-transformer";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../validators/global-validation-pipe-options";
import { JsonNumber } from "./json-number";

const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

class AmountBodyDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  implicit?: number;

  @IsOptional()
  @JsonNumber()
  @IsNumber()
  strict?: number;
}

const asBody = (body: Record<string, unknown>) =>
  pipe.transform(body, {
    type: "body",
    metatype: AmountBodyDto,
    data: "",
  } satisfies ArgumentMetadata) as Promise<AmountBodyDto>;

describe("JsonNumber", () => {
  it.each([
    ["59.9", 59.9],
    [" 59.9 ", 59.9],
    [true, 1],
    ["", 0],
  ])(
    "shows the problem it solves: implicit conversion reads %p as %p",
    async (raw, converted) => {
      await expect(asBody({ implicit: raw })).resolves.toMatchObject({
        implicit: converted,
      });
    },
  );

  it.each([59.9, 0, 150, 12345.67])(
    "keeps the JSON number %p",
    async (value) => {
      await expect(asBody({ strict: value })).resolves.toMatchObject({
        strict: value,
      });
    },
  );

  it.each(["59.9", " 59.9 ", "", true, false, [], {}, [59.9]])(
    "refuses %p with 400 instead of converting it",
    async (value) => {
      await expect(asBody({ strict: value })).rejects.toMatchObject({
        status: 400,
      });
    },
  );

  it("leaves a missing field missing", async () => {
    const body = await asBody({});
    expect(body.strict).toBeUndefined();
  });
});
