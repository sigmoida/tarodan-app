import { BRANDS_CACHE_PATTERN } from "../../../brand/brand-cache";
import { resolveRef } from "../../../../common/helpers/excel-import";
import { carModelSlug, generateSlug } from "../../../../common/helpers/slug";
import type {
  CatalogImportColumn,
  CatalogImportResource,
  CatalogImportSpec,
} from "./catalog-import.types";

/**
 * Üç katalog varlığının içe aktarma tanımları. Kolon listeleri buradaki TEK
 * kaynaktır; şablon üreticisi ve admin dialogu da bunları okur.
 *
 * Kasıtlı olarak DIŞARIDA bırakılanlar:
 * - `logo` / `gorsel`: S3 anahtarı gerektirir, Excel hücresinden gelemez.
 * - `slug`: ad'dan türetilir. Serbest bırakmak, elle eklemeyle içe aktarmanın
 *   farklı slug üretmesine ve tekillik kontrolünün tutarsızlaşmasına yol açar.
 */

const MIN_YEAR = 1800;
const maxYear = () => new Date().getFullYear() + 1;

const NAME_MAX = 120;
const DESCRIPTION_MAX = 1000;
const WEBSITE_MAX = 300;
const COUNTRY_MAX = 80;

/** Marka ve üretici şeması alan alan aynı — tek üreticiden çıkar. */
function companyColumns(exampleName: string): CatalogImportColumn[] {
  return [
    {
      key: "ad",
      required: true,
      type: "text",
      example: exampleName,
      maxLength: NAME_MAX,
    },
    {
      key: "aciklama",
      required: false,
      type: "text",
      example: "Koleksiyon model araç üreticisi.",
      maxLength: DESCRIPTION_MAX,
    },
    {
      key: "web_sitesi",
      required: false,
      type: "text",
      example: "https://ornek.com",
      maxLength: WEBSITE_MAX,
    },
    {
      key: "ulke",
      required: false,
      type: "text",
      example: "ABD",
      maxLength: COUNTRY_MAX,
    },
    {
      key: "kurulus_yili",
      required: false,
      type: "number",
      example: 1968,
      min: MIN_YEAR,
    },
    { key: "sira", required: false, type: "number", example: 0, min: 0 },
    { key: "aktif", required: false, type: "boolean", example: "Evet" },
  ];
}

/** Marka/üretici satırını Prisma gövdesine çevirir (ikisinde de aynı alanlar). */
function companyData(values: Record<string, unknown>) {
  return {
    name: values.ad as string,
    description: (values.aciklama as string | undefined) ?? null,
    website: (values.web_sitesi as string | undefined) ?? null,
    country: (values.ulke as string | undefined) ?? null,
    foundedYear: (values.kurulus_yili as number | undefined) ?? null,
    sortOrder: (values.sira as number | undefined) ?? 0,
    isActive: (values.aktif as boolean | undefined) ?? true,
  };
}

/** Yıl alanları için ortak akıl kontrolü — kolon `min`'i alt sınırı zaten tutuyor. */
function assertYearInRange(year: number | undefined, label: string): void {
  if (year == null) return;
  if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear()) {
    throw new Error(
      `${label} ${MIN_YEAR} ile ${maxYear()} arasında bir yıl olmalıdır`,
    );
  }
}

const brandSpec: CatalogImportSpec = {
  resource: "brands",
  sheetName: "Markalar",
  entityLabel: "marka",
  model: "brand",
  columns: companyColumns("Hot Wheels"),
  auditAction: "brand_bulk_import",
  auditEntity: "Brand",
  cachePattern: BRANDS_CACHE_PATTERN,
  parseRow: ({ values }) => {
    assertYearInRange(
      values.kurulus_yili as number | undefined,
      "kurulus_yili",
    );
    const name = values.ad as string;
    return { label: name, slug: generateSlug(name), data: companyData(values) };
  },
};

const manufacturerSpec: CatalogImportSpec = {
  resource: "manufacturers",
  sheetName: "Ureticiler",
  entityLabel: "üretici",
  model: "manufacturer",
  columns: companyColumns("Mattel"),
  auditAction: "manufacturer_bulk_import",
  auditEntity: "Manufacturer",
  // Üretici tarafında public cache yok; eklenince mağaza anında görür.
  parseRow: ({ values }) => {
    assertYearInRange(
      values.kurulus_yili as number | undefined,
      "kurulus_yili",
    );
    const name = values.ad as string;
    return { label: name, slug: generateSlug(name), data: companyData(values) };
  },
};

const carModelSpec: CatalogImportSpec = {
  resource: "car-models",
  sheetName: "Modeller",
  entityLabel: "araç modeli",
  model: "carModel",
  columns: [
    { key: "marka", required: true, type: "text", example: "Dodge" },
    {
      key: "ad",
      required: true,
      type: "text",
      example: "Challenger R/T",
      maxLength: NAME_MAX,
    },
    {
      key: "aciklama",
      required: false,
      type: "text",
      example: "1970-1974 arası üretilen kas araba.",
      maxLength: DESCRIPTION_MAX,
    },
    {
      key: "baslangic_yili",
      required: false,
      type: "number",
      example: 1970,
      min: MIN_YEAR,
    },
    {
      key: "bitis_yili",
      required: false,
      type: "number",
      example: 1974,
      min: MIN_YEAR,
    },
    { key: "sira", required: false, type: "number", example: 0, min: 0 },
    { key: "aktif", required: false, type: "boolean", example: "Evet" },
  ],
  auditAction: "car_model_bulk_import",
  auditEntity: "CarModel",
  cachePattern: "car-models:*",
  // Ad yalnız marka içinde tekil: "Ford Charger" ile "Dodge Charger" ayrı
  // kayıtlardır, global ad kontrolü ikincisini yanlışlıkla reddederdi.
  nameScopeField: "brandId",
  needsBrands: true,
  parseRow: ({ values, brands }) => {
    const yearStart = values.baslangic_yili as number | undefined;
    const yearEnd = values.bitis_yili as number | undefined;
    assertYearInRange(yearStart, "baslangic_yili");
    assertYearInRange(yearEnd, "bitis_yili");
    if (yearStart != null && yearEnd != null && yearStart > yearEnd) {
      throw new Error("baslangic_yili, bitis_yili'ndan büyük olamaz");
    }

    const brandInput = values.marka as string;
    let brand;
    try {
      // Pasif markalar da kabul edilir: marka sonradan aktifleştirilebilir.
      brand = resolveRef(brands, brandInput, "marka");
    } catch {
      throw new Error(
        `"${brandInput}" markası bulunamadı. Önce Markalar ekranından ekleyin.`,
      );
    }

    const name = values.ad as string;
    return {
      label: `${brand.name} ${name}`,
      slug: carModelSlug(brand.slug, name),
      data: {
        brandId: brand.id,
        name,
        description: (values.aciklama as string | undefined) ?? null,
        yearStart: yearStart ?? null,
        yearEnd: yearEnd ?? null,
        sortOrder: (values.sira as number | undefined) ?? 0,
        isActive: (values.aktif as boolean | undefined) ?? true,
      },
    };
  },
};

export const CATALOG_IMPORT_SPECS: Record<
  CatalogImportResource,
  CatalogImportSpec
> = {
  brands: brandSpec,
  manufacturers: manufacturerSpec,
  "car-models": carModelSpec,
};
