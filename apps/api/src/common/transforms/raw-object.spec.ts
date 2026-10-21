import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../validators/global-validation-pipe-options";
import { JsonObjectAsText, RawObject } from "./raw-object";

const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

class TextBodyDto {
  @IsOptional()
  @IsString()
  plain?: string;

  @IsOptional()
  @RawObject()
  @IsString()
  text?: string;

  @IsOptional()
  @JsonObjectAsText()
  @IsString()
  json?: string;
}

const asBody = (body: Record<string, unknown>) =>
  pipe.transform(body, {
    type: "body",
    metatype: TextBodyDto,
    data: "",
  } satisfies ArgumentMetadata) as Promise<TextBodyDto>;

describe("text fields of a JSON body", () => {
  it("without a decorator, takes an object as its placeholder text", async () => {
    // The defect both decorators exist for.
    await expect(asBody({ plain: { a: 1 } })).resolves.toMatchObject({
      plain: "[object Object]",
    });
  });

  describe("RawObject", () => {
    it.each([
      ["an object", { a: 1 }],
      ["an array", ["a"]],
    ])("refuses %s", async (_case, text) => {
      await expect(asBody({ text })).rejects.toMatchObject({ status: 400 });
    });

    it("keeps strings, reads numbers and booleans as text, skips null", async () => {
      await expect(asBody({ text: "x" })).resolves.toMatchObject({ text: "x" });
      await expect(asBody({ text: 5 })).resolves.toMatchObject({ text: "5" });
      await expect(asBody({ text: true })).resolves.toMatchObject({
        text: "true",
      });
      await expect(asBody({ text: null })).resolves.toMatchObject({
        text: null,
      });
    });
  });

  describe("JsonObjectAsText", () => {
    it("writes a plain object as its JSON text", async () => {
      await expect(
        asBody({ json: { group: ["a", "b"] } }),
      ).resolves.toMatchObject({ json: '{"group":["a","b"]}' });
    });

    it("keeps JSON text as it is", async () => {
      await expect(asBody({ json: '{"group":["a"]}' })).resolves.toMatchObject({
        json: '{"group":["a"]}',
      });
    });

    it("refuses an array", async () => {
      await expect(asBody({ json: ["a"] })).rejects.toMatchObject({
        status: 400,
      });
    });
  });
});
