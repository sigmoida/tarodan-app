import { BusinessStatus, SellerType } from "@prisma/client";

/**
 * Silinen hesabın kimlik arşivi — alan çözümlemesi.
 *
 * İki çağıran var ve İKİSİ DE aynı önceliği kullanmak zorunda:
 *   1. `UserProfileService.deleteAccount()` — silme anında, canlı veriden.
 *   2. `maintenance/backfill-deleted-user-identities.ts` — geçmişte silinmiş
 *      hesaplar için, anonimleştirmeden artakalan kayıtlardan.
 *
 * Mantık burada, DI'sız ve saf tutuluyor: aksi hâlde ancak tüm silme
 * transaction'ı üzerinden test edilebilirdi ve backfill kopyasıyla kaçınılmaz
 * olarak ayrışırdı.
 *
 * Kural: her alan için İLK DOLU kaynak kazanır; hiçbiri yoksa alan `null`
 * kalır — tahmin edilmez. Hangi alanın nereden geldiği `sourceDetail`,
 * kullanılan kayıtların id'leri `sourceRefs` ile arşive yazılır; denetimde
 * "bu TCKN nereden geldi / bu alan neden boş" sorusunun cevabı budur.
 */

/** Yasal saklama süresi: TTK m.82 ticari defter/belge saklama süresi. */
export const IDENTITY_RETENTION_YEARS = 10;

/** Silme anındaki anonim ad — `deleteAccount` bu sabiti yazar. */
export const ANONYMIZED_DISPLAY_NAME = "Silinmiş Kullanıcı";

/** Anonimleştirmede e-postanın yerine yazılan sentinel adres. */
export function anonymizedEmailFor(userId: string): string {
  return `deleted_${userId}@deleted.local`;
}

const ANONYMIZED_EMAIL_PATTERN = /^deleted_.+@deleted\.local$/i;

/**
 * Anonimleştirilmiş `users` satırı, kimlik alanları için kaynak DEĞİLDİR.
 * Backfill anonim satırı okuduğu için sentinel değerler ("Silinmiş Kullanıcı",
 * `deleted_...@deleted.local`) arşive gerçek kimlikmiş gibi yazılabilirdi;
 * çözümleyici bunları görmeden önce eler.
 */
export function isAnonymizedEmail(email: string | null | undefined): boolean {
  return !!email && ANONYMIZED_EMAIL_PATTERN.test(email);
}

export function computeRetainUntil(deletedAt: Date): Date {
  const until = new Date(deletedAt);
  until.setFullYear(until.getFullYear() + IDENTITY_RETENTION_YEARS);
  return until;
}

/** Bir alanın hangi kalıntı kayıttan çözüldüğü. */
export type IdentitySourceKey =
  | "user"
  | "address"
  | "seller_bank_account"
  | "corporate_application"
  | "corporate_stakeholder"
  | "elogo_invoice"
  | "order_shipping_address"
  | "payout_transfer"
  | "audit_log"
  | "email_log"
  | "security_log";

export interface IdentityUserSource {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  phone: string | null;
  birthDate: Date | null;
  taxId: string | null;
  taxOffice: string | null;
  companyName: string | null;
  companyType: string | null;
  companyCity: string | null;
  companyDistrict: string | null;
  sellerType: SellerType | null;
  businessStatus: BusinessStatus | null;
  isSeller: boolean;
  adminCode: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface IdentityAddressSource {
  fullName: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
}

export interface IdentityBankAccountSource {
  tcKimlikNo: string | null;
  taxId: string | null;
  iban: string | null;
  accountHolder: string | null;
}

export interface IdentityStakeholderSource {
  fullName: string | null;
  identityType: string | null;
  identityNumber: string | null;
}

export interface IdentityCorporateSource {
  id: string;
  authorizedFullName: string | null;
  companyLegalName: string | null;
  companyTitle: string | null;
  companyEmail: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  companyDistrict: string | null;
  phone: string | null;
  contactPhone: string | null;
  taxId: string | null;
  taxOffice: string | null;
  companyType: string | null;
  iban: string | null;
  bankAccountHolder: string | null;
  stakeholders?: IdentityStakeholderSource[];
}

export interface IdentityElogoSource {
  id: string;
  recipientVknTckn: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientCity: string | null;
  recipientDistrict: string | null;
  recipientStreet: string | null;
}

export interface IdentityOrderSource {
  id: string;
  /** `Order.shippingAddress` Json snapshot'ı — adres satırı silinse de kalır. */
  shippingAddress: unknown;
}

export interface IdentityPayoutSource {
  id: string;
  transferIban: string | null;
  transferName: string | null;
}

/**
 * Admin silmesinde `AuditLog.oldValue` `{ email, displayName, createdAt }`
 * taşıyor. `audit_logs` hiç purge edilmiyor → en dayanıklı e-posta kaynağı.
 */
export interface IdentityAuditSource {
  id: string;
  email?: string | null;
  displayName?: string | null;
}

export interface IdentitySources {
  user: IdentityUserSource;
  address?: IdentityAddressSource | null;
  bankAccount?: IdentityBankAccountSource | null;
  corporateApplication?: IdentityCorporateSource | null;
  elogoInvoice?: IdentityElogoSource | null;
  order?: IdentityOrderSource | null;
  payoutTransfer?: IdentityPayoutSource | null;
  auditLog?: IdentityAuditSource | null;
  /** `EmailLog.to` — 90 gün sonra purge edilir. */
  emailLogAddress?: string | null;
  /** `SecurityLog.email` — 180 gün sonra purge edilir. */
  securityLogAddress?: string | null;
  /** Ürün/ilan kaydı var mı — `wasSeller` türetmesi için. */
  hasProducts?: boolean;
}

/** Arşiv satırının çözümlenen kimlik alanları. */
export interface ResolvedIdentityValues {
  email: string | null;
  username: string;
  displayName: string | null;
  phone: string | null;
  birthDate: Date | null;
  nationalId: string | null;
  taxId: string | null;
  taxOffice: string | null;
  companyName: string | null;
  companyType: string | null;
  sellerType: SellerType | null;
  businessStatus: BusinessStatus | null;
  addressCity: string | null;
  addressDistrict: string | null;
  addressLine: string | null;
  iban: string | null;
  bankAccountHolder: string | null;
  wasSeller: boolean;
  adminCode: string | null;
  registeredAt: Date;
}

export interface ResolvedIdentity {
  values: ResolvedIdentityValues;
  /** Alan → kaynak. Çözülemeyen alanlar `null` ile AÇIKÇA yer alır. */
  sourceDetail: Record<string, IdentitySourceKey | null>;
  sourceRefs: Record<string, string>;
}

interface Candidate {
  value: string | null | undefined;
  source: IdentitySourceKey;
  ref?: [string, string];
}

function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Sipariş adres snapshot'ı serbest Json; alanları güvenle okunur. */
function shippingField(
  order: IdentityOrderSource | null | undefined,
  key: string,
): string | null {
  const snapshot = order?.shippingAddress;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  return clean((snapshot as Record<string, unknown>)[key] as string);
}

/** Türkiye ayrımı: 11 hane TCKN, 10 hane VKN. */
function digitsOnly(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function tcknOrNull(value: string | null | undefined): string | null {
  const digits = digitsOnly(clean(value));
  return digits && digits.length === 11 ? digits : null;
}

function vknOrNull(value: string | null | undefined): string | null {
  const digits = digitsOnly(clean(value));
  return digits && digits.length === 10 ? digits : null;
}

/**
 * Alanları ve provenance'ı birlikte biriktirir — ikisinin ayrı yazılması,
 * `sourceDetail`'in sessizce yanlış olmasına açık kapı bırakırdı.
 */
class Resolver {
  readonly sourceDetail: Record<string, IdentitySourceKey | null> = {};
  readonly sourceRefs: Record<string, string> = {};

  pick(field: string, candidates: Candidate[]): string | null {
    for (const candidate of candidates) {
      const value = clean(candidate.value);
      if (value === null) continue;
      this.sourceDetail[field] = candidate.source;
      if (candidate.ref) this.sourceRefs[candidate.ref[0]] = candidate.ref[1];
      return value;
    }
    this.sourceDetail[field] = null;
    return null;
  }

  /** Doğrudan `users` satırından gelen, önceliği olmayan alanlar. */
  fromUser<T>(field: string, value: T): T {
    this.sourceDetail[field] = value === null ? null : "user";
    return value;
  }
}

export function resolveIdentityFields(
  sources: IdentitySources,
): ResolvedIdentity {
  const {
    user,
    address,
    bankAccount,
    corporateApplication: corp,
    elogoInvoice: elogo,
    order,
    payoutTransfer: payout,
    auditLog: audit,
    emailLogAddress,
    securityLogAddress,
    hasProducts,
  } = sources;

  const r = new Resolver();
  const corpRef: [string, string] | undefined = corp
    ? ["corporateApplicationId", corp.id]
    : undefined;
  const elogoRef: [string, string] | undefined = elogo
    ? ["elogoInvoiceId", elogo.id]
    : undefined;
  const orderRef: [string, string] | undefined = order
    ? ["orderId", order.id]
    : undefined;
  const payoutRef: [string, string] | undefined = payout
    ? ["payoutTransferId", payout.id]
    : undefined;
  const auditRef: [string, string] | undefined = audit
    ? ["auditLogId", audit.id]
    : undefined;

  // Anonimleştirilmiş satırın sentinel değerleri kimlik sayılmaz.
  const liveEmail = isAnonymizedEmail(user.email) ? null : user.email;
  const liveDisplayName =
    clean(user.displayName) === ANONYMIZED_DISPLAY_NAME
      ? null
      : user.displayName;

  const email = r.pick("email", [
    { value: liveEmail, source: "user" },
    { value: audit?.email, source: "audit_log", ref: auditRef },
    { value: elogo?.recipientEmail, source: "elogo_invoice", ref: elogoRef },
    {
      value: corp?.companyEmail,
      source: "corporate_application",
      ref: corpRef,
    },
    { value: emailLogAddress, source: "email_log" },
    { value: securityLogAddress, source: "security_log" },
  ]);

  const displayName = r.pick("displayName", [
    { value: liveDisplayName, source: "user" },
    { value: audit?.displayName, source: "audit_log", ref: auditRef },
    {
      value: corp?.authorizedFullName,
      source: "corporate_application",
      ref: corpRef,
    },
    { value: bankAccount?.accountHolder, source: "seller_bank_account" },
    { value: payout?.transferName, source: "payout_transfer", ref: payoutRef },
    { value: address?.fullName, source: "address" },
    {
      value: shippingField(order, "fullName"),
      source: "order_shipping_address",
      ref: orderRef,
    },
  ]);

  const phone = r.pick("phone", [
    { value: user.phone, source: "user" },
    { value: address?.phone, source: "address" },
    {
      value: shippingField(order, "phone"),
      source: "order_shipping_address",
      ref: orderRef,
    },
    {
      value: corp?.contactPhone,
      source: "corporate_application",
      ref: corpRef,
    },
    { value: corp?.phone, source: "corporate_application", ref: corpRef },
  ]);

  // TCKN yalnız 11 haneli değerlerden; ortak kaydı yetkiliyle eşleşmiyorsa
  // başka bir gerçek kişinin numarasıdır, alınmaz.
  const matchingStakeholder = corp?.stakeholders?.find(
    (s) =>
      s.identityType === "tckn" &&
      clean(s.fullName) !== null &&
      clean(s.fullName) === clean(corp.authorizedFullName),
  );
  const nationalId = r.pick("nationalId", [
    {
      value: tcknOrNull(bankAccount?.tcKimlikNo),
      source: "seller_bank_account",
    },
    {
      value: tcknOrNull(matchingStakeholder?.identityNumber),
      source: "corporate_stakeholder",
      ref: corpRef,
    },
    {
      value: tcknOrNull(elogo?.recipientVknTckn),
      source: "elogo_invoice",
      ref: elogoRef,
    },
  ]);

  const taxId = r.pick("taxId", [
    { value: user.taxId, source: "user" },
    { value: bankAccount?.taxId, source: "seller_bank_account" },
    { value: corp?.taxId, source: "corporate_application", ref: corpRef },
    {
      value: vknOrNull(elogo?.recipientVknTckn),
      source: "elogo_invoice",
      ref: elogoRef,
    },
  ]);

  const taxOffice = r.pick("taxOffice", [
    { value: user.taxOffice, source: "user" },
    { value: corp?.taxOffice, source: "corporate_application", ref: corpRef },
  ]);

  const companyName = r.pick("companyName", [
    { value: user.companyName, source: "user" },
    {
      value: corp?.companyLegalName,
      source: "corporate_application",
      ref: corpRef,
    },
    {
      value: corp?.companyTitle,
      source: "corporate_application",
      ref: corpRef,
    },
  ]);

  const companyType = r.pick("companyType", [
    { value: user.companyType, source: "user" },
    { value: corp?.companyType, source: "corporate_application", ref: corpRef },
  ]);

  const addressCity = r.pick("addressCity", [
    { value: address?.city, source: "address" },
    {
      value: shippingField(order, "city"),
      source: "order_shipping_address",
      ref: orderRef,
    },
    { value: elogo?.recipientCity, source: "elogo_invoice", ref: elogoRef },
    { value: corp?.companyCity, source: "corporate_application", ref: corpRef },
    { value: user.companyCity, source: "user" },
  ]);

  const addressDistrict = r.pick("addressDistrict", [
    { value: address?.district, source: "address" },
    {
      value: shippingField(order, "district"),
      source: "order_shipping_address",
      ref: orderRef,
    },
    { value: elogo?.recipientDistrict, source: "elogo_invoice", ref: elogoRef },
    {
      value: corp?.companyDistrict,
      source: "corporate_application",
      ref: corpRef,
    },
    { value: user.companyDistrict, source: "user" },
  ]);

  const addressLine = r.pick("addressLine", [
    { value: address?.address, source: "address" },
    {
      value: shippingField(order, "address"),
      source: "order_shipping_address",
      ref: orderRef,
    },
    { value: elogo?.recipientStreet, source: "elogo_invoice", ref: elogoRef },
    {
      value: corp?.companyAddress,
      source: "corporate_application",
      ref: corpRef,
    },
  ]);

  const iban = r.pick("iban", [
    { value: bankAccount?.iban, source: "seller_bank_account" },
    { value: payout?.transferIban, source: "payout_transfer", ref: payoutRef },
    { value: corp?.iban, source: "corporate_application", ref: corpRef },
  ]);

  const bankAccountHolder = r.pick("bankAccountHolder", [
    { value: bankAccount?.accountHolder, source: "seller_bank_account" },
    { value: payout?.transferName, source: "payout_transfer", ref: payoutRef },
    {
      value: corp?.bankAccountHolder,
      source: "corporate_application",
      ref: corpRef,
    },
  ]);

  // `isSeller` silmede false'a çekiliyor; backfill'de bu bayrağa güvenilemez,
  // satıcılık kalıntı kayıtlardan türetilir.
  const wasSeller =
    user.isSeller ||
    user.sellerType !== null ||
    !!bankAccount ||
    !!payout ||
    !!corp ||
    hasProducts === true;

  return {
    values: {
      email,
      username: user.username,
      displayName,
      phone,
      birthDate: r.fromUser("birthDate", user.birthDate),
      nationalId,
      taxId,
      taxOffice,
      companyName,
      companyType,
      sellerType: r.fromUser("sellerType", user.sellerType),
      businessStatus: r.fromUser("businessStatus", user.businessStatus),
      addressCity,
      addressDistrict,
      addressLine,
      iban,
      bankAccountHolder,
      wasSeller,
      adminCode: r.fromUser("adminCode", user.adminCode),
      registeredAt: user.createdAt,
    },
    sourceDetail: r.sourceDetail,
    sourceRefs: r.sourceRefs,
  };
}

/**
 * Aylık bildirim dosyasının kolon sözleşmesi. Müşteri bu dosyayı resmî bir
 * portala yüklüyor: kolon kümesi ve SIRASI tek yerde tanımlı, XLSX ve CSV aynı
 * listeyi kullanır. Değişiklik `EXPORT_FORMAT_VERSION` ile görünür olur.
 */
export const EXPORT_FORMAT_VERSION = "1";

export const ARCHIVE_EXPORT_COLUMNS = [
  { key: "adminCode", header: "Kullanıcı Kodu" },
  { key: "username", header: "Kullanıcı Adı" },
  { key: "displayName", header: "Ad Soyad / Unvan" },
  { key: "email", header: "E-posta" },
  { key: "phone", header: "Telefon" },
  { key: "nationalId", header: "TC Kimlik No" },
  { key: "taxId", header: "Vergi No" },
  { key: "taxOffice", header: "Vergi Dairesi" },
  { key: "companyName", header: "Firma Adı" },
  { key: "addressCity", header: "İl" },
  { key: "addressDistrict", header: "İlçe" },
  { key: "addressLine", header: "Adres" },
  { key: "iban", header: "IBAN" },
  { key: "wasSeller", header: "Satıcı" },
  { key: "registeredAt", header: "Kayıt Tarihi" },
  { key: "deletedAt", header: "Silinme Tarihi" },
  { key: "retainUntil", header: "Saklama Bitişi" },
] as const;

export type ArchiveExportColumnKey =
  (typeof ARCHIVE_EXPORT_COLUMNS)[number]["key"];
