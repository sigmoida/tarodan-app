import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { IsInt, IsOptional, IsString } from "class-validator";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../validators/global-validation-pipe-options";
import { BlankToNull } from "./blank-to-null";

/**
 * Global pipe ayarlarıyla: sayısal alanda örtük dönüşüm `""`'yi `0` yapar;
 * dönüşüm ham girdiye baktığı için yine `null` çıkmalı.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

class ClearableDto {
  @IsOptional()
  @BlankToNull()
  @IsString()
  text?: string | null;

  @IsOptional()
  @BlankToNull()
  @IsInt()
  size?: number | null;
}

const asBody = async (body: Record<string, unknown>) => {
  const metadata: ArgumentMetadata = {
    type: "body",
    metatype: ClearableDto,
    data: "",
  };
  return (await pipe.transform(body, metadata)) as ClearableDto;
};

describe("BlankToNull", () => {
  it("boş ve yalnız-boşluk dizeyi null yapar", async () => {
    expect((await asBody({ text: "" })).text).toBeNull();
    expect((await asBody({ text: "   " })).text).toBeNull();
  });

  it("sayısal alanda örtük dönüşüme rağmen null yapar", async () => {
    expect((await asBody({ size: "" })).size).toBeNull();
  });

  it("dolu değere ve gönderilmeyen alana dokunmaz", async () => {
    const dto = await asBody({ text: "x", size: 3 });
    expect(dto).toEqual({ text: "x", size: 3 });
    expect(await asBody({})).not.toHaveProperty("text");
  });
});
