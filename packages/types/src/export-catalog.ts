/**
 * Admin Excel dökümlerinin kolon kataloğu — API'nin yazıcısı ve admin
 * ekranının ortak sözleşmesi.
 *
 * Her döküm kolonu burada BİR kez tanımlıdır: anahtar (admin tablosunun
 * `col.*` sıralama anahtarıyla aynı), başlık için katalog anahtarı ve hücre
 * tipi. API dosyayı bu listeden yazar; panel aynı listeyi okuyup hangi
 * kolonun dosyada olduğunu bilir. Başlık metni asla burada değil, i18n
 * kataloğundadır (`labelKey`).
 *
 * Tek istisna analitik dökümüdür: liste değildir, ekranın çizdiği yanıt
 * nesnesini alan adlarıyla (makine-okunur) yazar — bu yüzden kataloğu yoktur.
 * Bkz. docs/ADMIN_EXPORTS.md.
 */

/** Hücre tipi — biçim (tarih/para/evet-hayır) ve kolon genişliği buradan. */
export const EXPORT_COLUMN_TYPES = [
  "text",
  "number",
  "money",
  "date",
  "datetime",
  "boolean",
  "status",
] as const;

export type ExportColumnType = (typeof EXPORT_COLUMN_TYPES)[number];

export interface ExportColumn {
  /** Kayıttaki alan; admin tablosunda kolon varsa onun `col.*` anahtarı. */
  readonly key: string;
  /** Başlığın i18n katalog anahtarı. */
  readonly labelKey: string;
  readonly type: ExportColumnType;
  /**
   * Değer, çağıranın maskesiz görme hakkı yoksa maskelenir (TCKN, vergi no,
   * IBAN). Hakkı uç belirler — `@Roles` kimliği zaten yalnız yetkiliye açan
   * dökümlerde maskesiz yazılır.
   */
  readonly masked?: boolean;
}

export interface ExportCatalog<
  TColumns extends readonly ExportColumn[] = readonly ExportColumn[],
> {
  /** Kaynağın adı (`payoutHolds`, `consents`, …) — denetim kaydı ve doküman. */
  readonly resource: string;
  /** Dosyadaki kolon SIRASI bu dizinin sırasıdır. */
  readonly columns: TColumns;
  readonly keys: ReadonlyArray<TColumns[number]["key"]>;
}

/** Bir kataloğun kolon anahtarları (eşleyicinin döndürdüğü kaydın anahtarları). */
export type ExportCatalogKey<TCatalog> =
  TCatalog extends ExportCatalog<infer TColumns>
    ? TColumns[number]["key"]
    : never;

export function defineExportCatalog<const T extends readonly ExportColumn[]>(
  resource: string,
  columns: T,
): ExportCatalog<T> {
  const keys = columns.map((column) => column.key);
  // Aynı anahtar iki kez tanımlanırsa ikinci kolon birincinin değerini yazardı.
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Export catalog "${resource}" has duplicate column keys`);
  }
  return { resource, columns, keys };
}

// ── Satıcı ödemeleri ─────────────────────────────────────────────────────────

/** Escrow (hold) sekmesi. `amount` ekrandaki gibi NET tutardır (brüt − iade). */
const payoutHolds = defineExportCatalog("payoutHolds", [
  { key: "orderNumber", labelKey: "admin.finance.common.order", type: "text" },
  { key: "sellerName", labelKey: "admin.finance.common.seller", type: "text" },
  { key: "sellerEmail", labelKey: "common.email", type: "text" },
  { key: "amount", labelKey: "common.amount", type: "money" },
  {
    key: "refundedAmount",
    labelKey: "admin.finance.payouts.refundedAmount",
    type: "money",
  },
  { key: "status", labelKey: "common.status", type: "status" },
  {
    key: "releaseAt",
    labelKey: "admin.finance.payouts.plannedRelease",
    type: "date",
  },
  {
    key: "releasedAt",
    labelKey: "admin.finance.payouts.releasedOn",
    type: "date",
  },
  {
    key: "earlyReleaseDays",
    labelKey: "admin.finance.payouts.earlyReleaseDays",
    type: "number",
  },
  {
    key: "createdAt",
    labelKey: "admin.finance.common.createdAt",
    type: "datetime",
  },
]);

/** Transferler sekmesi (gerçek banka transferleri). IBAN yalnız son 4 hane. */
const payoutTransfers = defineExportCatalog("payoutTransfers", [
  { key: "orderNumber", labelKey: "admin.finance.common.order", type: "text" },
  { key: "sellerName", labelKey: "admin.finance.common.seller", type: "text" },
  { key: "sellerEmail", labelKey: "common.email", type: "text" },
  {
    key: "netAmount",
    labelKey: "admin.finance.payouts.netAmount",
    type: "money",
  },
  {
    key: "adjustmentDeduction",
    labelKey: "admin.finance.payouts.deduction",
    type: "money",
  },
  {
    key: "ibanLast4",
    labelKey: "admin.finance.payouts.ibanLast4",
    type: "text",
  },
  { key: "status", labelKey: "common.status", type: "status" },
  {
    key: "failureReason",
    labelKey: "admin.finance.payments.failureReason",
    type: "text",
  },
  { key: "createdAt", labelKey: "common.date", type: "datetime" },
]);

// ── Kampanyalar ──────────────────────────────────────────────────────────────

/** Bir indirim şablonunun tek kullanımlık kodları. */
const voucherCodes = defineExportCatalog("voucherCodes", [
  { key: "code", labelKey: "admin.marketing.discounts.code", type: "text" },
  {
    key: "isRedeemed",
    labelKey: "admin.marketing.discounts.codes.redeemed",
    type: "boolean",
  },
  {
    key: "redeemedAt",
    labelKey: "admin.marketing.discounts.codes.redeemedAt",
    type: "datetime",
  },
  {
    key: "orderNumber",
    labelKey: "admin.finance.common.orderNumber",
    type: "text",
  },
  {
    key: "createdAt",
    labelKey: "admin.finance.common.createdAt",
    type: "datetime",
  },
]);

// ── Kullanıcılar ─────────────────────────────────────────────────────────────

const CONSENT = "admin.consents.export";

/** Onay Kayıtları — hukuki ispat dökümü (IP / e-posta taşır, maskesiz). */
const consents = defineExportCatalog("consents", [
  { key: "createdAt", labelKey: `${CONSENT}.createdAt`, type: "datetime" },
  { key: "document", labelKey: `${CONSENT}.document`, type: "text" },
  { key: "version", labelKey: `${CONSENT}.version`, type: "text" },
  {
    key: "isCurrentVersion",
    labelKey: `${CONSENT}.currentVersion`,
    type: "boolean",
  },
  { key: "action", labelKey: `${CONSENT}.action`, type: "status" },
  { key: "source", labelKey: `${CONSENT}.source`, type: "status" },
  { key: "subjectType", labelKey: `${CONSENT}.subjectType`, type: "status" },
  { key: "userCode", labelKey: `${CONSENT}.userCode`, type: "text" },
  { key: "userName", labelKey: `${CONSENT}.userName`, type: "text" },
  { key: "userEmail", labelKey: `${CONSENT}.userEmail`, type: "text" },
  { key: "guestEmail", labelKey: `${CONSENT}.guestEmail`, type: "text" },
  { key: "visitorId", labelKey: `${CONSENT}.visitorId`, type: "text" },
  { key: "ipAddress", labelKey: `${CONSENT}.ipAddress`, type: "text" },
  { key: "userAgent", labelKey: `${CONSENT}.userAgent`, type: "text" },
  {
    key: "cookieCategories",
    labelKey: `${CONSENT}.cookieCategories`,
    type: "text",
  },
  { key: "checkoutGroup", labelKey: `${CONSENT}.checkoutGroup`, type: "text" },
  { key: "order", labelKey: `${CONSENT}.order`, type: "text" },
]);

const DELETED = "admin.deletedIdentities";

/**
 * Silinen hesap kimlikleri — aylık resmî bildirim. Müşteri dosyayı bir
 * portala yüklüyor: kolon kümesi ve SIRASI sözleşmedir, değişiklik API'deki
 * `EXPORT_FORMAT_VERSION` (Bilgi sayfası) ile görünür olur.
 */
const deletedIdentities = defineExportCatalog("deletedIdentities", [
  { key: "adminCode", labelKey: `${DELETED}.export.adminCode`, type: "text" },
  { key: "username", labelKey: `${DELETED}.export.username`, type: "text" },
  {
    key: "displayName",
    labelKey: `${DELETED}.export.legalName`,
    type: "text",
  },
  { key: "email", labelKey: `${DELETED}.email`, type: "text" },
  { key: "phone", labelKey: `${DELETED}.phone`, type: "text" },
  {
    key: "nationalId",
    labelKey: `${DELETED}.nationalId`,
    type: "text",
    masked: true,
  },
  { key: "taxId", labelKey: `${DELETED}.taxId`, type: "text", masked: true },
  {
    key: "taxOffice",
    labelKey: "admin.accounts.sellerApplications.taxOffice",
    type: "text",
  },
  {
    key: "companyName",
    labelKey: "admin.accounts.sellerApplications.companyName",
    type: "text",
  },
  { key: "addressCity", labelKey: "address.city", type: "text" },
  { key: "addressDistrict", labelKey: "address.district", type: "text" },
  { key: "addressLine", labelKey: "common.address", type: "text" },
  {
    key: "iban",
    labelKey: "admin.accounts.sellerApplications.iban",
    type: "text",
    masked: true,
  },
  { key: "wasSeller", labelKey: `${DELETED}.wasSeller`, type: "boolean" },
  { key: "registeredAt", labelKey: "admin.users.registeredAt", type: "date" },
  { key: "deletedAt", labelKey: `${DELETED}.export.deletedAt`, type: "date" },
  { key: "retainUntil", labelKey: `${DELETED}.retainUntil`, type: "date" },
]);

// ── Finans / vergi ───────────────────────────────────────────────────────────

const GIB = "admin.gibReport.export";

/** GİB ilan / satıcı raporu. Kimlik no TAM yazılır (uç yalnız admin+). */
const gibReport = defineExportCatalog("gibReport", [
  { key: "membershipDate", labelKey: `${GIB}.membershipDate`, type: "date" },
  {
    key: "identityNumber",
    labelKey: `${GIB}.identityNumber`,
    type: "text",
    masked: true,
  },
  { key: "identityKind", labelKey: `${GIB}.identityKind`, type: "status" },
  { key: "legalName", labelKey: `${GIB}.legalName`, type: "text" },
  {
    key: "legalNameSource",
    labelKey: `${GIB}.legalNameSource`,
    type: "status",
  },
  { key: "sellerKind", labelKey: `${GIB}.sellerKind`, type: "status" },
  { key: "sellerDeleted", labelKey: `${GIB}.sellerDeleted`, type: "boolean" },
  { key: "productCode", labelKey: `${GIB}.productCode`, type: "text" },
  { key: "title", labelKey: `${GIB}.title`, type: "text" },
  { key: "description", labelKey: `${GIB}.description`, type: "text" },
  { key: "price", labelKey: `${GIB}.price`, type: "money" },
  { key: "status", labelKey: `${GIB}.status`, type: "status" },
  { key: "publishedAt", labelKey: `${GIB}.publishedAt`, type: "datetime" },
  { key: "createdAt", labelKey: `${GIB}.createdAt`, type: "datetime" },
  { key: "listingUrl", labelKey: `${GIB}.listingUrl`, type: "text" },
  { key: "storeName", labelKey: `${GIB}.storeName`, type: "text" },
  { key: "profileUrl", labelKey: `${GIB}.profileUrl`, type: "text" },
]);

// ── Operasyon ────────────────────────────────────────────────────────────────

const CANCEL = "admin.operations.cancellations.export";

/**
 * İptaller — UZUN biçim: satır = iptal KALEMİ. İlk altı kolon üst kaydın
 * (sepet / sipariş / takas) kolonlarıdır ve her kalem satırında TEKRARLANIR;
 * üst kaydın toplamı Özet sayfasındadır, veri sayfasında toplanmaz.
 */
export const CANCELLATION_EXPORT_PARENT_KEYS = [
  "rowNumber",
  "testLane",
  "origin",
  "orderDate",
  "buyer",
  "buyerCode",
] as const;

const cancellations = defineExportCatalog("cancellations", [
  { key: "rowNumber", labelKey: `${CANCEL}.rowNumber`, type: "text" },
  { key: "testLane", labelKey: `${CANCEL}.testLane`, type: "boolean" },
  { key: "origin", labelKey: `${CANCEL}.origin`, type: "status" },
  { key: "orderDate", labelKey: `${CANCEL}.orderDate`, type: "datetime" },
  { key: "buyer", labelKey: `${CANCEL}.buyer`, type: "text" },
  { key: "buyerCode", labelKey: `${CANCEL}.buyerCode`, type: "text" },
  { key: "orderNumber", labelKey: `${CANCEL}.orderNumber`, type: "text" },
  { key: "seller", labelKey: `${CANCEL}.seller`, type: "text" },
  { key: "sellerCode", labelKey: `${CANCEL}.sellerCode`, type: "text" },
  { key: "product", labelKey: `${CANCEL}.product`, type: "text" },
  { key: "productCode", labelKey: `${CANCEL}.productCode`, type: "text" },
  { key: "quantity", labelKey: `${CANCEL}.quantity`, type: "number" },
  { key: "unitPrice", labelKey: `${CANCEL}.unitPrice`, type: "money" },
  { key: "subtotal", labelKey: `${CANCEL}.subtotal`, type: "money" },
  { key: "cancelledAt", labelKey: `${CANCEL}.cancelledAt`, type: "datetime" },
  { key: "cancelledBy", labelKey: `${CANCEL}.cancelledBy`, type: "status" },
  { key: "reason", labelKey: `${CANCEL}.reason`, type: "text" },
  { key: "refundState", labelKey: `${CANCEL}.refundState`, type: "status" },
]);

/** Kapsamdaki her dökümün kataloğu — sözleşme spec'i bu listeyi dolaşır. */
export const EXPORT_CATALOGS = {
  payoutHolds,
  payoutTransfers,
  voucherCodes,
  consents,
  deletedIdentities,
  gibReport,
  cancellations,
} as const;

export type ExportResource = keyof typeof EXPORT_CATALOGS;
