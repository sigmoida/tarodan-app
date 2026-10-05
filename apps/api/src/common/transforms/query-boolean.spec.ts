import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../validators/global-validation-pipe-options";
import { AdminUserQueryDto } from "../../modules/admin/dto/admin-query.dto";
import { QueryBoolean } from "./query-boolean";

/**
 * Query-string boolean'ları GERÇEK global pipe ayarlarıyla
 * (`enableImplicitConversion: true`) dönüştürülür. Örtük dönüşüm `boolean`
 * alanda özel `@Transform`'dan ÖNCE `Boolean(value)` uygular; `value`ya bakan
 * dönüşüm bu yüzden `?flag=false`u `true` görür.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const asQuery = async <T>(
  metatype: new () => T,
  query: Record<string, string>,
): Promise<T> => {
  const metadata: ArgumentMetadata = { type: "query", metatype, data: "" };
  return (await pipe.transform(query, metadata)) as T;
};

class LegacyFlagDto {
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  flag?: boolean;
}

class QueryFlagDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  flag?: boolean;
}

describe("QueryBoolean (global ValidationPipe ayarlarıyla)", () => {
  it("KANIT: value'ya bakan eski dönüşüm '?flag=false'u true yapar", async () => {
    // Bu test kırılırsa class-transformer davranışı değişmiştir; o zaman
    // QueryBoolean'ın gerekçesi yeniden değerlendirilmeli.
    expect((await asQuery(LegacyFlagDto, { flag: "false" })).flag).toBe(true);
  });

  it("ham girdiyi okur: 'false' → false, 'true' → true", async () => {
    expect((await asQuery(QueryFlagDto, { flag: "false" })).flag).toBe(false);
    expect((await asQuery(QueryFlagDto, { flag: "true" })).flag).toBe(true);
  });

  it("'true' dışındaki her değer false; gönderilmeyen alan yoktur", async () => {
    expect((await asQuery(QueryFlagDto, { flag: "" })).flag).toBe(false);
    expect((await asQuery(QueryFlagDto, { flag: "all" })).flag).toBe(false);
    expect(await asQuery(QueryFlagDto, {})).not.toHaveProperty("flag");
  });
});

describe("AdminUserQueryDto boolean filtreleri", () => {
  const FLAGS = [
    "identityIncomplete",
    "isBanned",
    "isTestAccount",
    "isSeller",
    "isVerified",
  ] as const;

  it.each(FLAGS)("?%s=false filtre UYGULAMAZ (false kalır)", async (flag) => {
    const dto = await asQuery(AdminUserQueryDto, { [flag]: "false" });
    expect(dto[flag]).toBe(false);
  });

  it.each(FLAGS)("?%s=true true olur", async (flag) => {
    const dto = await asQuery(AdminUserQueryDto, { [flag]: "true" });
    expect(dto[flag]).toBe(true);
  });
});
