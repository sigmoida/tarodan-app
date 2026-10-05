/**
 * GİB (Gelir İdaresi Başkanlığı) ilan / satıcı raporu — API, admin ekranı ve
 * Excel dökümünün ortak sözleşmesi.
 *
 * Devletin istediği veri biçimi henüz yayımlanmadı; ekran bilinen alanları
 * sunar. Her satır TEK İLAN'dır ve ilanın BUGÜNKÜ hâlini yansıtır (ilan
 * düzenlemeleri üzerine yazılır, geçmiş tutulmaz).
 */

/** Satıcı türü filtresi: onaylı kurumsal kimlik var mı yok mu. */
export const GIB_SELLER_KINDS = ["individual", "corporate"] as const;
export type GibSellerKind = (typeof GIB_SELLER_KINDS)[number];

/** Prisma `ProductStatus` ile birebir (API contract spec'i kilitler). */
export const GIB_LISTING_STATUSES = [
  "pending",
  "active",
  "reserved",
  "sold",
  "inactive",
  "rejected",
  "deleted",
  "suspended",
] as const;
export type GibListingStatus = (typeof GIB_LISTING_STATUSES)[number];

/** Durum etiketleri mevcut `status.product.*` kataloğundan (ikinci liste yok). */
export const GIB_LISTING_STATUS_I18N_KEYS = {
  pending: "status.product.pending",
  active: "status.product.active",
  reserved: "status.product.reserved",
  sold: "status.product.sold",
  inactive: "status.product.inactive",
  rejected: "status.product.rejected",
  deleted: "status.product.deleted",
  suspended: "status.product.suspended",
} as const satisfies Record<GibListingStatus, string>;

/**
 * Yasal adın hangi kayıttan çözüldüğü — personelin güvenilirliği yargılaması
 * için satır başına döner. Sıra güvenilirlik sırasıdır (firma adı en güçlü,
 * takma ad olabilen görünen ad en zayıf); `none` = çözülemedi.
 */
export const GIB_NAME_SOURCES = [
  "company",
  "bank_account_holder",
  "address",
  "display_name",
  "archive_company",
  "archive_bank_account_holder",
  "archive_display_name",
  "none",
] as const;
export type GibNameSource = (typeof GIB_NAME_SOURCES)[number];

export const GIB_NAME_SOURCE_I18N_KEYS = {
  company: "admin.gibReport.nameSources.company",
  bank_account_holder: "admin.gibReport.nameSources.bankAccountHolder",
  address: "admin.gibReport.nameSources.address",
  display_name: "admin.gibReport.nameSources.displayName",
  archive_company: "admin.gibReport.nameSources.archiveCompany",
  archive_bank_account_holder:
    "admin.gibReport.nameSources.archiveBankAccountHolder",
  archive_display_name: "admin.gibReport.nameSources.archiveDisplayName",
  none: "admin.gibReport.nameSources.none",
} as const satisfies Record<GibNameSource, string>;

export const GIB_SELLER_KIND_I18N_KEYS = {
  individual: "admin.gibReport.sellerKinds.individual",
  corporate: "admin.gibReport.sellerKinds.corporate",
} as const satisfies Record<GibSellerKind, string>;

/** Kimlik numarasının türü: 11 haneli TCKN ya da vergi numarası (VKN). */
export const GIB_IDENTITY_KINDS = ["tckn", "tax_number"] as const;
export type GibIdentityKind = (typeof GIB_IDENTITY_KINDS)[number];

export const GIB_IDENTITY_KIND_I18N_KEYS = {
  tckn: "admin.gibReport.identityKinds.tckn",
  tax_number: "admin.gibReport.identityKinds.taxNumber",
} as const satisfies Record<GibIdentityKind, string>;

/** `GET /admin/gib-report` satırı. */
export interface AdminGibReportRow {
  productId: string;
  /** İnsan-okunur ilan kodu (U010001). */
  productCode: string;
  title: string;
  description: string | null;
  /** İlanın GÜNCEL fiyatı (₺): satıcının girdiği fiyat, kampanya/kupon hariç. */
  price: number;
  status: GibListingStatus;
  /** SON yayına giriş (her admin onayında tazelenir); hiç onaylanmadıysa null. */
  publishedAt: string | null;
  createdAt: string;
  /** Herkese açık ilan adresi (mutlak). */
  listingUrl: string;

  sellerId: string;
  sellerKind: GibSellerKind;
  /** Silinmiş hesap: kimlik arşivden çözüldü. */
  sellerDeleted: boolean;
  /** Üyelik tarihi (hesabın oluşturulması). */
  membershipDate: string;
  /** TCKN ya da vergi numarası; sistemde yoksa null. */
  identityNumber: string | null;
  identityKind: GibIdentityKind | null;
  /** Ad-soyad / unvan; çözülemediyse null. */
  legalName: string | null;
  legalNameSource: GibNameSource;
  /** Herkese açık profil / mağaza adı. */
  storeName: string | null;
  /** Herkese açık profil adresi (mutlak); silinmiş hesapta null. */
  profileUrl: string | null;
}
