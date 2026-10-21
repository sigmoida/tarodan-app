import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { IsBoolean, IsOptional } from "class-validator";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../validators/global-validation-pipe-options";
import { JsonBoolean } from "./json-boolean";

const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

class ConsentBodyDto {
  @IsOptional()
  @IsBoolean()
  implicit?: boolean;

  @IsOptional()
  @JsonBoolean()
  @IsBoolean()
  strict?: boolean;
}

const asBody = (body: Record<string, unknown>) =>
  pipe.transform(body, {
    type: "body",
    metatype: ConsentBodyDto,
    data: "",
  } satisfies ArgumentMetadata) as Promise<ConsentBodyDto>;

describe("JsonBoolean", () => {
  it("shows the problem it solves: implicit conversion makes 'false' true", async () => {
    await expect(asBody({ implicit: "false" })).resolves.toMatchObject({
      implicit: true,
    });
  });

  it.each([true, false])("keeps a JSON %p", async (value) => {
    await expect(asBody({ strict: value })).resolves.toMatchObject({
      strict: value,
    });
  });

  it.each(["false", "true", "yes", "", 1, 0])(
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
