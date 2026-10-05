import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { apiAppRoot } from "../helpers/app-root";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../validators/global-validation-pipe-options";
import { AdminUserQueryDto } from "../../modules/admin/dto/admin-query.dto";
import { OrderQueryDto } from "../../modules/order/dto/order-query.dto";
import { SecurityLogQueryDto } from "../../modules/admin/dto/logs-admin.dto";
import { AdminCollectionQueryDto } from "../../modules/admin/dto/collection-admin.dto";
import { AnalyticsRangeQueryDto } from "../../modules/admin/dto/analytics.dto";
import {
  PayoutExportQueryDto,
  PayoutTransactionsQueryDto,
} from "../../modules/admin/dto/payout.dto";
import { GibReportQueryDto } from "../../modules/admin/dto/gib-report.dto";
import {
  AdminAttributeGroupQueryDto,
  AdminAttributeQueryDto,
} from "../../modules/admin/dto/attribute-admin.dto";
import {
  DeletedUserIdentityExportQueryDto,
  DeletedUserIdentityQueryDto,
} from "../../modules/admin/dto/deleted-user-identity.dto";
import { PspStatementLinesQueryDto } from "../../modules/admin/finance/dto/psp-reconciliation.dto";
import { ProductQueryDto } from "../../modules/product/dto/product-query.dto";
import { DiscountQueryDto } from "../../modules/discount/dto/discount-query.dto";
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

  it("'true' dışındaki her değer false; gönderilmeyen alan YOKTUR (üç durum korunur)", async () => {
    expect((await asQuery(QueryFlagDto, { flag: "" })).flag).toBe(false);
    expect((await asQuery(QueryFlagDto, { flag: "all" })).flag).toBe(false);
    expect(await asQuery(QueryFlagDto, {})).not.toHaveProperty("flag");
  });
});

// ─── Her boolean query alanı ────────────────────────────────────────────────

/**
 * `@QueryBoolean()` taşıyan her DTO sınıfı + zorunlu alanları (pipe'ın 400
 * vermemesi için). Alan listesi ELLE tutulmaz: aşağıda kaynaktan taranır, yani
 * yeni bir `@QueryBoolean()` alanı eklenince testi otomatik olarak kapsanır;
 * sınıfı bu tabloda yoksa test hangi sınıfın ekleneceğini söyleyerek düşer.
 */
const DTOS: Record<
  string,
  { metatype: new () => object; base?: Record<string, string> }
> = {
  AdminUserQueryDto: { metatype: AdminUserQueryDto },
  OrderQueryDto: { metatype: OrderQueryDto },
  SecurityLogQueryDto: { metatype: SecurityLogQueryDto },
  AdminCollectionQueryDto: { metatype: AdminCollectionQueryDto },
  AnalyticsRangeQueryDto: { metatype: AnalyticsRangeQueryDto },
  PayoutTransactionsQueryDto: { metatype: PayoutTransactionsQueryDto },
  PayoutExportQueryDto: { metatype: PayoutExportQueryDto },
  GibReportQueryDto: { metatype: GibReportQueryDto },
  AdminAttributeGroupQueryDto: { metatype: AdminAttributeGroupQueryDto },
  AdminAttributeQueryDto: { metatype: AdminAttributeQueryDto },
  DeletedUserIdentityQueryDto: { metatype: DeletedUserIdentityQueryDto },
  DeletedUserIdentityExportQueryDto: {
    metatype: DeletedUserIdentityExportQueryDto,
    base: { year: "2026", month: "9" },
  },
  PspStatementLinesQueryDto: { metatype: PspStatementLinesQueryDto },
  ProductQueryDto: { metatype: ProductQueryDto },
  DiscountQueryDto: { metatype: DiscountQueryDto },
};

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
  });

/** Kaynaktaki her `@QueryBoolean()` alanı: sınıf + alan adı. */
function queryBooleanFields(): Array<{
  file: string;
  dto: string;
  field: string;
}> {
  const root = apiAppRoot();
  const found: Array<{ file: string; dto: string; field: string }> = [];
  for (const path of sourceFiles(join(root, "src"))) {
    const text = readFileSync(path, "utf8");
    const marker = /@QueryBoolean\(\)/g;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(text)) !== null) {
      const before = text.slice(0, match.index);
      const classes = [...before.matchAll(/export class (\w+)/g)];
      const dto = classes[classes.length - 1]?.[1];
      const after = text.slice(match.index);
      const field = /\n\s+(\w+)[?!]?:\s*boolean/.exec(after)?.[1];
      if (dto && field) {
        found.push({ file: relative(root, path), dto, field });
      }
    }
  }
  return found;
}

describe("her @QueryBoolean() alanı: false false kalır, true true olur, yoksa yoktur", () => {
  const fields = queryBooleanFields();

  it("tarama alanları buluyor (bu dalda 30 alan)", () => {
    expect(fields.length).toBeGreaterThanOrEqual(30);
  });

  it("her alanın sınıfı tabloda (yeni sınıf → DTOS'a ekleyin)", () => {
    const missing = [...new Set(fields.map((f) => f.dto))].filter(
      (dto) => !DTOS[dto],
    );
    expect(missing).toEqual([]);
  });

  it.each(fields.map((f) => [`${f.dto}.${f.field}`, f] as const))(
    "%s",
    async (_label, { dto, field }) => {
      const entry = DTOS[dto];
      if (!entry) return; // bir önceki test düşer
      const base = entry.base ?? {};
      const read = async (query: Record<string, string>) =>
        (await asQuery(entry.metatype, query)) as Record<string, unknown>;

      expect((await read({ ...base, [field]: "false" }))[field]).toBe(false);
      expect((await read({ ...base, [field]: "true" }))[field]).toBe(true);
      expect(await read(base)).not.toHaveProperty(field);
    },
  );
});

// ─── Sözleşme: eski kalıp geri gelmesin ─────────────────────────────────────

describe("sözleşme: query boolean'ı value'dan okuyan dönüşüm yok", () => {
  /**
   * `value`ya bakan boolean dönüşümü örtük dönüşümden SONRA çalışır ve
   * `"false"`u `true` görür; `@Type(() => Boolean)` da aynı `Boolean("false")`
   * hatasını yapar. İkisi de `@QueryBoolean()` ile değiştirilmelidir.
   */
  const LEGACY = [
    /@Transform\(\s*\(\s*\{\s*value\s*\}\s*\)\s*=>\s*value\s*===\s*(?:"true"|'true'|true)\s*\|\|\s*value\s*===\s*(?:"true"|'true'|true)\s*,?\s*\)/,
    /@Type\(\s*\(\)\s*=>\s*Boolean\s*\)/,
  ];

  it("src altında eski kalıp kullanılmıyor", () => {
    const root = apiAppRoot();
    const offenders = sourceFiles(join(root, "src"))
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return LEGACY.some((pattern) => pattern.test(text));
      })
      .map((path) => relative(root, path))
      // Bu dosyanın kendisi kalıbı açıklar (yorumda), kullanmaz.
      .filter((path) => !path.endsWith("common/transforms/query-boolean.ts"));
    expect(offenders).toEqual([]);
  });
});
