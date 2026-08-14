import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type * as ExcelJS from "exceljs";
import { PrismaService } from "../../../prisma";
import {
  assertNoFormulas,
  cellText,
  collectDataRowNumbers,
  loadImportSheet,
  optionalNumber,
  parseBoolean,
  readHeaderMap,
} from "../../../common/helpers/excel-import";
import { CacheService } from "../../cache/cache.service";
import { AdminAuditService } from "../admin-audit.service";
import { CATALOG_IMPORT_SPECS } from "./catalog-import.specs";
import {
  CATALOG_IMPORT_LIMITS,
  type CatalogImportBrandRef,
  type CatalogImportColumn,
  type CatalogImportParsedRow,
  type CatalogImportResource,
  type CatalogImportResult,
  type CatalogImportRowValues,
  type CatalogImportSchemaResponse,
  type CatalogImportSpec,
} from "./catalog-import.types";

export const CATALOG_IMPORT_VALIDATION_FAILED =
  "CATALOG_IMPORT_VALIDATION_FAILED";

/** Gerçek .xlsx yüklemelerinde karşılaşılan MIME türleri (boş türe de izin var). */
const CATALOG_IMPORT_ACCEPTED_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/x-zip-compressed",
  "application/zip",
]);

/**
 * Kolonların hepsi Prisma `Int` alanlarına yazılıyor (`sortOrder`, yıllar).
 * Ondalık veya 32-bit taşan bir değer doğrulamadan sızarsa `createMany`
 * PrismaClientValidationError atar ve kullanıcı satır listesi yerine 500 görür.
 */
const INT32_MAX = 2_147_483_647;
const INT32_MIN = -2_147_483_648;

/**
 * Katalog referans verisi (marka / üretici / araç modeli) toplu içe aktarma
 * motoru. Üç kaynak da aynı gövdeyi kullanır; farklar `CATALOG_IMPORT_SPECS`
 * içindeki tanımlarda.
 *
 * HEPSİ YA DA HİÇ: tek bir satır bile doğrulamayı geçemezse HİÇBİR kayıt
 * oluşturulmaz ve tüm hatalar satır numarasıyla birlikte döner. Yarım kalmış
 * bir içe aktarmada kullanıcı hangi satırın geçtiğini bilemez ve dosyayı
 * yeniden yüklemek mükerrer kayıt korkusu yaratırdı.
 */
@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AdminAuditService,
  ) {}

  getSchema(resource: CatalogImportResource): CatalogImportSchemaResponse {
    const spec = CATALOG_IMPORT_SPECS[resource];
    return {
      resource,
      sheetName: spec.sheetName,
      columns: spec.columns,
      limits: CATALOG_IMPORT_LIMITS,
    };
  }

  async import(
    adminId: string,
    resource: CatalogImportResource,
    file: Express.Multer.File,
  ): Promise<CatalogImportResult> {
    const spec = CATALOG_IMPORT_SPECS[resource];
    this.assertWorkbookFile(file);

    const sheet = await loadImportSheet(file.buffer, spec.sheetName);
    assertNoFormulas(sheet, spec.sheetName);
    const headers = readHeaderMap(sheet);
    this.assertHeaders(headers, spec);

    const rowNumbers = collectDataRowNumbers(sheet);
    if (!rowNumbers.length) {
      throw new BadRequestException(
        `'${spec.sheetName}' sayfasında veri satırı yok. Şablonu doldurup yeniden yükleyin.`,
      );
    }
    if (rowNumbers.length > CATALOG_IMPORT_LIMITS.maxRows) {
      throw new BadRequestException(
        `Tek seferde en fazla ${CATALOG_IMPORT_LIMITS.maxRows} satır aktarılabilir (dosyada ${rowNumbers.length} satır var).`,
      );
    }

    const brands = spec.needsBrands ? await this.loadBrands() : [];
    const errors: string[] = [];
    const rows: CatalogImportParsedRow[] = [];

    for (const rowNumber of rowNumbers) {
      try {
        rows.push(this.parseRow(sheet, rowNumber, headers, spec, brands));
      } catch (error) {
        errors.push(`${rowNumber}. satır: ${this.messageOf(error)}`);
      }
    }

    // Biçim hataları varken bile mevcut-kayıt kontrolü çalışır: kullanıcı
    // düzeltilecek her şeyi TEK turda görsün, önce biçimi düzeltip yeniden
    // yükledikten sonra "bu marka zaten var" ile ikinci kez geri dönmesin.
    errors.push(...this.findFileDuplicates(rows));
    errors.push(...(await this.findExistingConflicts(rows, spec)));

    if (errors.length) throw this.validationError(errors);

    await this.persist(spec, rows);

    // Audit ve cache TRANSACTION DIŞINDA: `createAuditLog` transaction
    // client'ını almıyor, içeriden çağrılsa rollback'te hayalet kayıt kalırdı.
    //
    // Satır başına değil, dosya başına TEK kayıt: aksi halde 200 satırlık bir
    // dosya denetim günlüğünü tek başına 200 satırla doldururdu. `entityId`
    // NOT NULL olduğu için toplu işlemi tanımlayan bir parti kimliği üretilir.
    const batchId = randomUUID();
    await this.audit.createAuditLog(
      adminId,
      spec.auditAction,
      spec.auditEntity,
      batchId,
      null,
      {
        batchId,
        createdCount: rows.length,
        names: rows.map((row) => row.label),
      },
    );
    if (spec.cachePattern) await this.cache.delPattern(spec.cachePattern);

    this.logger.log(
      `Catalog bulk import: ${rows.length} ${resource} by admin ${adminId}`,
    );

    return {
      resource,
      createdCount: rows.length,
      names: rows.map((row) => row.label),
    };
  }

  private assertWorkbookFile(file: Express.Multer.File | undefined): void {
    if (!file) throw new BadRequestException("Excel dosyası yüklenmedi.");
    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      throw new BadRequestException(
        "Yalnızca .xlsx uzantılı Excel dosyası yüklenebilir.",
      );
    }
    // MIME türü Office kaydı olmayan sistemlerde boş gelir ve tarayıcı parçayı
    // `application/octet-stream` olarak gönderir. Katı bir eşitlik kontrolü,
    // kullanıcının gerçekten .xlsx seçtiği durumda "yalnızca .xlsx yükleyin"
    // diyen çelişkili bir hata üretirdi. Asıl kapı uzantı + gerçek ayrıştırma:
    // xlsx olmayan bir gövde `loadImportSheet` içinde temiz 400 ile düşer.
    if (file.mimetype && !CATALOG_IMPORT_ACCEPTED_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        "Yalnızca .xlsx uzantılı Excel dosyası yüklenebilir.",
      );
    }
    if (file.size > CATALOG_IMPORT_LIMITS.maxFileBytes) {
      throw new BadRequestException(
        `Dosya en fazla ${Math.round(CATALOG_IMPORT_LIMITS.maxFileBytes / 1024 / 1024)} MB olabilir.`,
      );
    }
  }

  private assertHeaders(
    headers: Map<string, number>,
    spec: CatalogImportSpec,
  ): void {
    const missing = spec.columns
      .map((column) => column.key)
      .filter((key) => !headers.has(key));
    if (missing.length) {
      throw new BadRequestException(
        `Excel sütunları eksik: ${missing.join(", ")}. Örnek dosyayı yeniden indirin.`,
      );
    }
  }

  private parseRow(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    headers: Map<string, number>,
    spec: CatalogImportSpec,
    brands: CatalogImportBrandRef[],
  ): CatalogImportParsedRow {
    const row = sheet.getRow(rowNumber);
    const values: CatalogImportRowValues = {};
    for (const column of spec.columns) {
      values[column.key] = this.readCell(
        row.getCell(headers.get(column.key)!).value,
        column,
      );
    }

    const parsed = spec.parseRow({ values, brands });
    if (!parsed.slug) {
      throw new Error(
        `"${parsed.label}" adından geçerli bir adres (slug) üretilemedi; en az bir harf veya rakam içermeli`,
      );
    }
    return { rowNumber, ...parsed };
  }

  private readCell(
    value: ExcelJS.CellValue | undefined,
    column: CatalogImportColumn,
  ): string | number | boolean | undefined {
    const raw = cellText(value);
    if (raw === "") {
      if (column.required) throw new Error(`"${column.key}" zorunludur`);
      return undefined;
    }

    if (column.type === "boolean") {
      return this.wrapColumnError(column, () => parseBoolean(value));
    }
    if (column.type === "number") {
      const parsed = this.wrapColumnError(column, () => optionalNumber(value))!;
      // Tüm sayısal katalog kolonları Prisma `Int`. Ondalık ya da 32-bit taşan
      // bir değer buradan geçerse hata satır listesi yerine 500 olarak döner.
      if (
        !Number.isInteger(parsed) ||
        parsed > INT32_MAX ||
        parsed < INT32_MIN
      ) {
        throw new Error(`"${column.key}" tam sayı olmalıdır`);
      }
      if (column.min != null && parsed < column.min) {
        throw new Error(`"${column.key}" en az ${column.min} olmalıdır`);
      }
      if (column.max != null && parsed > column.max) {
        throw new Error(`"${column.key}" en fazla ${column.max} olabilir`);
      }
      return parsed;
    }

    if (column.maxLength && raw.length > column.maxLength) {
      throw new Error(
        `"${column.key}" en fazla ${column.maxLength} karakter olabilir (${raw.length} karakter girildi)`,
      );
    }
    return raw;
  }

  private wrapColumnError<T>(column: CatalogImportColumn, read: () => T): T {
    try {
      return read();
    } catch (error) {
      throw new Error(`"${column.key}": ${this.messageOf(error)}`);
    }
  }

  /**
   * Dosya içi çakışma. Slug tek tekillik eksenidir: aynı ad da, farklı yazılıp
   * aynı slug'a düşen iki ad da ("Şahin" / "Sahin") burada yakalanır.
   */
  private findFileDuplicates(rows: CatalogImportParsedRow[]): string[] {
    const errors: string[] = [];
    const seen = new Map<string, CatalogImportParsedRow>();
    for (const row of rows) {
      const first = seen.get(row.slug);
      if (!first) {
        seen.set(row.slug, row);
        continue;
      }
      errors.push(
        first.label.toLocaleLowerCase("tr-TR") ===
          row.label.toLocaleLowerCase("tr-TR")
          ? `${row.rowNumber}. satır: "${row.label}" dosyada ${first.rowNumber}. satırda zaten var`
          : `${row.rowNumber}. satır: "${row.label}", ${first.rowNumber}. satırdaki "${first.label}" ile aynı adresi (${row.slug}) üretiyor`,
      );
    }
    return errors;
  }

  /**
   * Veritabanında zaten bulunan kayıtlar — atlanmaz, hata olarak raporlanır.
   *
   * İKİ eksen birden kontrol edilir: slug ve ad. Yalnız slug'a bakmak yeterli
   * değil; eski kayıtların slug'ı bozuk üreteçle yazılmış olabilir ve tekil
   * ekleme yolu da ad kontrolü yapıyor (`createBrand`, `createCarModel`).
   * Aynı adın iki kez girilmesini bir yolda engelleyip diğerinde serbest
   * bırakmak, iki yüzeyi tutarsız hale getirirdi.
   */
  private async findExistingConflicts(
    rows: CatalogImportParsedRow[],
    spec: CatalogImportSpec,
  ): Promise<string[]> {
    if (!rows.length) return [];

    const nameOf = (row: CatalogImportParsedRow) => row.data.name as string;
    const scopeOf = (row: CatalogImportParsedRow) =>
      spec.nameScopeField ? String(row.data[spec.nameScopeField]) : "";
    const nameKey = (scope: string, name: string) =>
      `${scope} ${name.trim().toLocaleLowerCase("tr-TR")}`;

    const nameWhere = spec.nameScopeField
      ? {
          [spec.nameScopeField]: { in: rows.map(scopeOf) },
          name: { in: rows.map(nameOf), mode: "insensitive" as const },
        }
      : { name: { in: rows.map(nameOf), mode: "insensitive" as const } };

    const existing = (await this.delegate(spec).findMany({
      where: { OR: [{ slug: { in: rows.map((row) => row.slug) } }, nameWhere] },
      select: {
        name: true,
        slug: true,
        ...(spec.nameScopeField ? { [spec.nameScopeField]: true } : {}),
      },
    })) as Array<Record<string, string>>;
    if (!existing.length) return [];

    const bySlug = new Set(existing.map((item) => item.slug));
    const byName = new Set(
      existing.map((item) =>
        nameKey(
          spec.nameScopeField ? String(item[spec.nameScopeField]) : "",
          item.name,
        ),
      ),
    );

    return rows.flatMap((row) =>
      bySlug.has(row.slug) || byName.has(nameKey(scopeOf(row), nameOf(row)))
        ? [
            `${row.rowNumber}. satır: "${row.label}" adlı ${spec.entityLabel} zaten kayıtlı`,
          ]
        : [],
    );
  }

  private async persist(
    spec: CatalogImportSpec,
    rows: CatalogImportParsedRow[],
  ): Promise<void> {
    const data = rows.map((row) => ({ ...row.data, slug: row.slug }));
    try {
      await this.prisma.$transaction(async (tx) => {
        await (tx as any)[spec.model].createMany({ data });
      });
    } catch (error) {
      // Doğrulama ile yazma arasında başka bir yükleme aynı kaydı oluşturmuş
      // olabilir. Ham P2002 kullanıcıya 500 olarak döner; aynı doğrulama
      // gövdesine çevirip dialogun hata listesini göstermesini sağlarız.
      if ((error as { code?: string })?.code === "P2002") {
        throw this.validationError([
          `Bu ${spec.entityLabel} kayıtlarından biri siz yüklerken başka bir işlemle oluşturuldu. Hiçbir kayıt eklenmedi; listeyi tazeleyip dosyayı yeniden yükleyin.`,
        ]);
      }
      throw error;
    }
  }

  private validationError(errors: string[]): BadRequestException {
    return new BadRequestException({
      code: CATALOG_IMPORT_VALIDATION_FAILED,
      message: "Excel dosyasında düzeltilmesi gereken satırlar var.",
      errors,
    });
  }

  private async loadBrands(): Promise<CatalogImportBrandRef[]> {
    return this.prisma.brand.findMany({
      select: { id: true, name: true, slug: true, isActive: true },
    });
  }

  private delegate(spec: CatalogImportSpec) {
    return (this.prisma as any)[spec.model];
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
