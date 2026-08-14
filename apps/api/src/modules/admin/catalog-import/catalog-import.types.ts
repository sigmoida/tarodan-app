import { MAX_UPLOAD_BYTES } from "../../../common/upload/multer-options";

/**
 * Katalog referans verisi (marka / üretici / araç modeli) toplu içe aktarma
 * sözleşmesi. Motor (`CatalogImportService`) ayrıştırma, doğrulama, tekillik ve
 * kayıt akışını BİR KEZ yazar; her varlık yalnızca kolonlarını ve satır→kayıt
 * dönüşümünü tanımlar.
 *
 * `columns` TEK KAYNAKTIR: doğrulayıcı, indirilebilir şablon ve admin
 * dialogundaki "örnek dosya yapısı" tablosu aynı diziden beslenir. Kolon
 * eklemek/çıkarmak için tek dosya değişir, üçü birden takip eder.
 */

export const CATALOG_IMPORT_RESOURCES = [
  "brands",
  "manufacturers",
  "car-models",
] as const;

export type CatalogImportResource = (typeof CATALOG_IMPORT_RESOURCES)[number];

export const CATALOG_IMPORT_LIMITS = {
  /**
   * Görsel yok, satırlar küçük: tek transaction saniyeler sürer. Sınırı sonra
   * yükseltmek kolay, düşürmek zordur — temkinli başlıyoruz.
   */
  maxRows: 200,
  /** Yalnızca xlsx; BFF proxy gövdeyi tamamen belleğe aldığı için düşük tutuldu. */
  maxFileBytes: Math.min(2 * 1024 * 1024, MAX_UPLOAD_BYTES),
} as const;

export type CatalogImportColumnType = "text" | "number" | "boolean";

export interface CatalogImportColumn {
  /** Excel başlığı (kanonik: küçük harf + alt çizgi). */
  key: string;
  required: boolean;
  type: CatalogImportColumnType;
  /** Şablondaki örnek satırda görünen değer. */
  example: string | number | boolean | null;
  maxLength?: number;
  min?: number;
  max?: number;
}

/** Ayrıştırılıp tipi doğrulanmış satır değerleri (`column.key` → değer). */
export type CatalogImportRowValues = Record<
  string,
  string | number | boolean | undefined
>;

export interface CatalogImportBrandRef {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface CatalogImportRowContext {
  values: CatalogImportRowValues;
  /** `needsBrands` isteyen tanımlar için önden çekilmiş marka listesi. */
  brands: CatalogImportBrandRef[];
}

export interface CatalogImportParsedRow {
  rowNumber: number;
  /** Kullanıcıya gösterilen ad — sonuç ekranında listelenir. */
  label: string;
  /**
   * Tekillik ekseni. Marka/üretici için ad'dan, araç modeli için
   * `marka slug'ı + ad`'dan türetilir; ikisinde de `slug @unique` olduğu için
   * dosya içi ve veritabanı çakışması tek anahtarla yakalanır.
   */
  slug: string;
  /** `prisma.<model>.createMany` gövdesi (slug hariç — motor ekler). */
  data: Record<string, unknown>;
}

export interface CatalogImportSpec {
  resource: CatalogImportResource;
  /** Excel sayfa adı — şablon da bu adla üretilir. */
  sheetName: string;
  /** Hata ve sonuç metinlerinde geçen tekil ad ("marka"). */
  entityLabel: string;
  /** Prisma delegate adı. */
  model: "brand" | "manufacturer" | "carModel";
  columns: CatalogImportColumn[];
  auditAction: string;
  auditEntity: string;
  /** Yazma sonrası temizlenecek cache deseni; yoksa o varlıkta cache yok. */
  cachePattern?: string;
  /**
   * Ad tekilliğinin kapsamı. Marka ve üreticide `name` global @unique olduğu
   * için `undefined`. Araç modelinde ad yalnız marka içinde tekildir; kapsam
   * alanı verilmezse "Ford Charger" ile "Dodge Charger" yanlışlıkla çakışır.
   *
   * Slug kontrolü tek başına YETMEZ: eski satırların slug'ları bozuk üreteçle
   * yazılmış olabilir ("Tofaş"+"Şahin" → `tofa-ahin`) ve `createCarModel`
   * çağırandan gelen slug'ı da kabul ediyor. Tekil ekleme yolu `brandId + ad`
   * kontrolü yaptığı için içe aktarma da aynısını yapmalı.
   */
  nameScopeField?: "brandId";
  /** Satır ayrıştırması marka listesine ihtiyaç duyuyor mu? */
  needsBrands?: boolean;
  /** Tip/uzunluk doğrulaması geçmiş değerleri kayda çevirir; hata = satır hatası. */
  parseRow(
    context: CatalogImportRowContext,
  ): Omit<CatalogImportParsedRow, "rowNumber">;
}

export interface CatalogImportResult {
  resource: CatalogImportResource;
  createdCount: number;
  /** Sonuç ekranında listelenen adlar. */
  names: string[];
}

/** Admin dialogundaki "örnek dosya yapısı" tablosunu besleyen yanıt. */
export interface CatalogImportSchemaResponse {
  resource: CatalogImportResource;
  sheetName: string;
  columns: CatalogImportColumn[];
  limits: typeof CATALOG_IMPORT_LIMITS;
}
