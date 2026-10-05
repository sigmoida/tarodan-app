/**
 * İLANIN VİTRİNDEN DÜŞME NEDENLERİ — TEK KAYNAK.
 *
 * Bir ilan dört statüyle vitrinden düşer (`inactive`, `deleted`, `rejected`,
 * `suspended`); statü NE olduğunu söyler, NEDEN olduğunu söylemez. Bu katalog
 * nedeni üç aktöre bölerek tanımlar:
 *
 * - **seller** — satıcının kendi kararı (silme / pasife alma). Satıcı neden
 *   seçmek ZORUNDADIR (web/mobil formu); yalnız eski mobil sürümler nedensiz
 *   istek gönderebildiği için API nedeni opsiyonel kabul eder ve kaydı
 *   `not_given` olarak düşer. `not_given` hiçbir formda seçenek değildir.
 * - **system** — platformun kendi işleri (ilan ömrü, stok bitişi, teslim
 *   sonrası iade karantinası, satıcının hesabının askıya alınması).
 * - **admin** — Tarodan'ın kural ihlali nedeniyle kaldırması (moderasyon
 *   reddi / yönetici kaldırması); ihlal kodu {@link LISTING_VIOLATION_CODES}.
 *
 * API (doğrulama + kayıt), web (satıcı formu), admin (liste, filtre, red
 * formu, dashboard) bu dosyayı okur; bir neden yalnız bir tarafta var olamaz.
 * Etiketler katalog anahtarlarıdır (`status.listingRemoval.*`).
 *
 * Ayrıntı: docs/LISTING_REMOVAL_REASONS.md.
 */

import type { DashboardPeriodRange } from "./dashboard";

// ── Aktörler ve nedenler ─────────────────────────────────────────────────────

export const LISTING_REMOVAL_ACTORS = ["seller", "system", "admin"] as const;

export type ListingRemovalActor = (typeof LISTING_REMOVAL_ACTORS)[number];

/**
 * Bütün nedenler. Sıra = ekran sırası (aktör grupları birlikte). API'deki
 * Prisma enum'u (`ListingRemovalReason`) bu listeyle birebir aynıdır — bir
 * kontrat spec'i ikisinin ayrışmasını yakalar.
 */
export const LISTING_REMOVAL_REASONS = [
  // seller
  "not_given",
  "changed_mind",
  "sold_elsewhere",
  "paused_temporarily",
  // system
  "expired",
  "out_of_stock",
  "return_quarantine",
  "seller_suspended",
  // admin
  "policy_violation",
] as const;

export type ListingRemovalReason = (typeof LISTING_REMOVAL_REASONS)[number];

/** Nedeni kimin koyduğu — her neden TEK bir aktöre aittir. */
export const LISTING_REMOVAL_REASONS_BY_ACTOR = {
  seller: ["not_given", "changed_mind", "sold_elsewhere", "paused_temporarily"],
  system: ["expired", "out_of_stock", "return_quarantine", "seller_suspended"],
  admin: ["policy_violation"],
} as const satisfies Record<
  ListingRemovalActor,
  readonly ListingRemovalReason[]
>;

/**
 * Eski istemci (neden göndermeyen mobil sürüm) için sunucunun yazdığı neden.
 * Formlarda seçenek DEĞİLDİR; bir istemci bunu açıkça gönderirse reddedilir.
 */
export const LISTING_REMOVAL_REASON_NOT_GIVEN = "not_given" as const;

export function isListingRemovalReason(
  value: unknown,
): value is ListingRemovalReason {
  return (
    typeof value === "string" &&
    (LISTING_REMOVAL_REASONS as readonly string[]).includes(value)
  );
}

export function isListingRemovalActor(
  value: unknown,
): value is ListingRemovalActor {
  return (
    typeof value === "string" &&
    (LISTING_REMOVAL_ACTORS as readonly string[]).includes(value)
  );
}

/** Nedenin aktörü (her neden tek gruba aittir). */
export function listingRemovalActorOf(
  reason: ListingRemovalReason,
): ListingRemovalActor {
  for (const actor of LISTING_REMOVAL_ACTORS) {
    if (
      (LISTING_REMOVAL_REASONS_BY_ACTOR[actor] as readonly string[]).includes(
        reason,
      )
    ) {
      return actor;
    }
  }
  // Ulaşılamaz: katalog her nedeni bir gruba koyar (spec ile korunur).
  return "system";
}

// ── Statüler ─────────────────────────────────────────────────────────────────

/**
 * İlanı vitrinden düşüren statüler. Bunlardan birine GEÇİŞ bir kaldırma
 * olayıdır; bu kümenin dışına çıkış (yeniden yayın, onaya gönderme, satış)
 * ilanın güncel nedenini temizler.
 */
export const LISTING_REMOVED_STATUSES = [
  "inactive",
  "deleted",
  "rejected",
  "suspended",
] as const;

export type ListingRemovedStatus = (typeof LISTING_REMOVED_STATUSES)[number];

export function isListingRemovedStatus(
  status: unknown,
): status is ListingRemovedStatus {
  return (
    typeof status === "string" &&
    (LISTING_REMOVED_STATUSES as readonly string[]).includes(status)
  );
}

// ── Sayım kuralı: vitrinden düşüş ────────────────────────────────────────────

/**
 * Vitrindeki (alıcının görüp satın alabildiği) statü. Bir kaldırma olayı
 * yalnız ilan bu statüden çıktıysa "vitrinden düşüş" sayılır — dashboard
 * kırılımı yalnız bunları sayar. Diğer başlangıç statülerinden (onay bekleyen,
 * reddedilmiş, zaten pasif, rezerve, satılmış) yapılan kaldırmalar geçmiş için
 * kaydedilir ama sayılmaz: ilan zaten vitrinde değildi. Kayıt anında olaya
 * `fromStorefront` olarak yazılır; sorgular statüden yeniden hesaplamaz.
 */
export const LISTING_STOREFRONT_STATUSES = ["active"] as const;

export function wasOnStorefront(statusBefore: unknown): boolean {
  return (
    typeof statusBefore === "string" &&
    (LISTING_STOREFRONT_STATUSES as readonly string[]).includes(statusBefore)
  );
}

/**
 * İlanın GÜNCEL nedenini bu yeni olay değiştirebilir mi?
 *
 * - Vitrinden düşüş her zaman günceller.
 * - Vitrin dışındaki bir ilanda (reddedilmiş, askıda, süresi dolmuş…)
 *   satıcının sonraki eylemi (pasife alma, silme) bir yönetici ya da sistem
 *   nedenini EZMEZ: reddedilmiş ilanı satıcının pasife alması onu "kural
 *   ihlali" filtresinden düşürmemeli. Yönetici ve sistem nedenleri her zaman
 *   günceller (ör. duraklatılmış ilan iade karantinasına girerse).
 */
export function replacesCurrentRemovalReason(change: {
  fromStorefront: boolean;
  reason: ListingRemovalReason;
  current: ListingRemovalReason | null;
}): boolean {
  if (change.fromStorefront) return true;
  if (listingRemovalActorOf(change.reason) !== "seller") return true;
  return (
    change.current === null ||
    listingRemovalActorOf(change.current) === "seller"
  );
}

// ── Eylemler ve izinli nedenler ──────────────────────────────────────────────

/**
 * Bir kaldırmayı başlatan eylem. Satıcı ilanını siler ya da pasife alır;
 * yönetici reddeder ya da kaldırır (yönetici "silmesi" = `delete`).
 */
export const LISTING_REMOVAL_ACTIONS = [
  "delete",
  "deactivate",
  "reject",
] as const;

export type ListingRemovalAction = (typeof LISTING_REMOVAL_ACTIONS)[number];

/** Nedeni bir formdan seçen aktörler (sistem nedenleri kodda sabittir). */
export type ListingRemovalChoosingActor = Exclude<
  ListingRemovalActor,
  "system"
>;

/**
 * Aktör × eylem → seçilebilen nedenler. Listede olmayan eylem o aktöre kapalıdır
 * (satıcı reddedemez, yönetici "pasife alma" nedeni seçmez). Geçici duraklatma
 * YALNIZ pasife almada vardır: silinen ilan geri gelmez.
 */
export const LISTING_REMOVAL_REASON_OPTIONS: Record<
  ListingRemovalChoosingActor,
  Partial<Record<ListingRemovalAction, readonly ListingRemovalReason[]>>
> = {
  seller: {
    delete: ["changed_mind", "sold_elsewhere"],
    deactivate: ["changed_mind", "sold_elsewhere", "paused_temporarily"],
  },
  admin: {
    delete: ["policy_violation"],
    reject: ["policy_violation"],
  },
};

/** Bu aktörün bu eylemde seçebileceği nedenler (ekran sırasıyla). */
export function listingRemovalReasonOptions(
  actor: ListingRemovalChoosingActor,
  action: ListingRemovalAction,
): readonly ListingRemovalReason[] {
  return LISTING_REMOVAL_REASON_OPTIONS[actor][action] ?? [];
}

// ── Başka platformda satış ───────────────────────────────────────────────────

/**
 * "Başka platformda sattım" seçildiğinde sorulan platform. `other` seçilirse
 * platformun adı serbest metinle (detail) yazılır.
 */
export const LISTING_REMOVAL_PLATFORMS = [
  "letgo",
  "instagram",
  "dolap",
  "sahibinden",
  "in_person",
  "other",
] as const;

export type ListingRemovalPlatform = (typeof LISTING_REMOVAL_PLATFORMS)[number];

export function isListingRemovalPlatform(
  value: unknown,
): value is ListingRemovalPlatform {
  return (
    typeof value === "string" &&
    (LISTING_REMOVAL_PLATFORMS as readonly string[]).includes(value)
  );
}

// ── İhlal kodları (yönetici kaldırması) ──────────────────────────────────────

/**
 * Yönetici kaldırmasının ihlal kodu. YER TUTUCU LİSTE: müşteri kesin listeyi
 * henüz vermedi. Kodlar DB'de metin olarak tutulur (Prisma enum'u değil) —
 * listeyi değiştirmek bir göç gerektirmez: buraya ekle/çıkar + iki dilde
 * `status.listingRemoval.violation.<kod>` anahtarı. Kaldırılan bir kod eski
 * kayıtlarda kalır; ekran onu bilinmeyen kod olarak (ham kodla) gösterir.
 */
export const LISTING_VIOLATION_CODES = [
  "counterfeit_replica",
  "prohibited_item",
  "misleading_content",
  "inappropriate_content",
  "duplicate_listing",
  "wrong_category_or_price",
  "other",
] as const;

export type ListingViolationCode = (typeof LISTING_VIOLATION_CODES)[number];

export function isListingViolationCode(
  value: unknown,
): value is ListingViolationCode {
  return (
    typeof value === "string" &&
    (LISTING_VIOLATION_CODES as readonly string[]).includes(value)
  );
}

// ── Doğrulama kuralı ─────────────────────────────────────────────────────────

/** Serbest metnin üst sınırı (satıcı açıklaması ve yönetici açıklaması). */
export const LISTING_REMOVAL_DETAIL_MAX_LENGTH = 500;

/** Bir kaldırma isteğinin neden alanları (istemcinin gönderdiği şekil). */
export interface ListingRemovalInput {
  reason?: string | null;
  platform?: string | null;
  violationCode?: string | null;
  detail?: string | null;
}

/** Boşlukları kırpılmış, boş metni `null`a çevrilmiş giriş. */
export interface NormalizedListingRemovalInput {
  reason: string | null;
  platform: string | null;
  violationCode: string | null;
  detail: string | null;
}

const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
};

export function normalizeListingRemovalInput(
  input: ListingRemovalInput | null | undefined,
): NormalizedListingRemovalInput {
  return {
    reason: blankToNull(input?.reason),
    platform: blankToNull(input?.platform),
    violationCode: blankToNull(input?.violationCode),
    detail: blankToNull(input?.detail),
  };
}

/** Bir girişin neden reddedildiği — çağıran kendi metnine/anahtarına eşler. */
export type ListingRemovalIssue =
  | "reason_required"
  | "reason_not_allowed"
  | "platform_required"
  | "platform_invalid"
  | "platform_not_allowed"
  | "violation_required"
  | "violation_invalid"
  | "violation_not_allowed"
  | "detail_required"
  | "detail_too_long";

export const LISTING_REMOVAL_ISSUES = [
  "reason_required",
  "reason_not_allowed",
  "platform_required",
  "platform_invalid",
  "platform_not_allowed",
  "violation_required",
  "violation_invalid",
  "violation_not_allowed",
  "detail_required",
  "detail_too_long",
] as const satisfies readonly ListingRemovalIssue[];

/**
 * TEK kural: bu aktör, bu eylemde, bu girişle kaldırma yapabilir mi?
 * `null` = geçerli. Sıra önemlidir — ekran ilk sorunu alanın altında gösterir.
 *
 * - Neden zorunludur ve aktör×eylem için izinli olmalıdır
 *   ({@link listingRemovalReasonOptions}).
 * - `sold_elsewhere` platform ister; `other` platformu serbest metin ister
 *   (hangi platform?). Diğer nedenlerde platform gönderilemez.
 * - `policy_violation` ihlal kodu ister; `other` kodu serbest metin ister.
 *   Diğer nedenlerde ihlal kodu gönderilemez.
 * - Serbest metin her zaman opsiyoneldir (yukarıdaki iki durum hariç) ve
 *   {@link LISTING_REMOVAL_DETAIL_MAX_LENGTH} karakteri aşamaz.
 *
 * API'nin geriye uyum istisnası (nedensiz eski istemci → `not_given`, kodsuz
 * eski red → kodsuz `policy_violation`) bu kuralın DIŞINDADIR: kural yalnız
 * gönderilen bir neden/kodu doğrular; formlar her zaman kuralın tamamını uygular.
 */
export function listingRemovalIssue(
  context: { actor: ListingRemovalChoosingActor; action: ListingRemovalAction },
  input: ListingRemovalInput | null | undefined,
): ListingRemovalIssue | null {
  const { reason, platform, violationCode, detail } =
    normalizeListingRemovalInput(input);

  if (!reason) return "reason_required";
  const allowed = listingRemovalReasonOptions(context.actor, context.action);
  if (!(allowed as readonly string[]).includes(reason)) {
    return "reason_not_allowed";
  }

  if (detail && detail.length > LISTING_REMOVAL_DETAIL_MAX_LENGTH) {
    return "detail_too_long";
  }

  if (reason === "sold_elsewhere") {
    if (!platform) return "platform_required";
    if (!isListingRemovalPlatform(platform)) return "platform_invalid";
    if (platform === "other" && !detail) return "detail_required";
  } else if (platform) {
    return "platform_not_allowed";
  }

  if (reason === "policy_violation") {
    if (!violationCode) return "violation_required";
    if (!isListingViolationCode(violationCode)) return "violation_invalid";
    if (violationCode === "other" && !detail) return "detail_required";
  } else if (violationCode) {
    return "violation_not_allowed";
  }

  return null;
}

// ── Etiket anahtarları ───────────────────────────────────────────────────────

/** Nedeni olmayan kaldırma (bu özellikten önce düşen ilanlar): "Bilinmiyor". */
export const LISTING_REMOVAL_UNKNOWN_I18N_KEY = "status.listingRemoval.unknown";

export function listingRemovalReasonI18nKey(
  reason: ListingRemovalReason | null | undefined,
): string {
  return reason
    ? `status.listingRemoval.reason.${reason}`
    : LISTING_REMOVAL_UNKNOWN_I18N_KEY;
}

export function listingRemovalActorI18nKey(
  actor: ListingRemovalActor | null | undefined,
): string {
  return actor
    ? `status.listingRemoval.actor.${actor}`
    : LISTING_REMOVAL_UNKNOWN_I18N_KEY;
}

/**
 * Platform etiketi; katalog dışı (eski/elle yazılmış) bir değer için `null`
 * döner — ekran ham değeri gösterir.
 */
export function listingRemovalPlatformI18nKey(
  platform: string | null | undefined,
): string | null {
  return isListingRemovalPlatform(platform)
    ? `status.listingRemoval.platform.${platform}`
    : null;
}

/** İhlal kodu etiketi; katalogdan çıkarılmış bir kod için `null` (ham kod gösterilir). */
export function listingViolationI18nKey(
  code: string | null | undefined,
): string | null {
  return isListingViolationCode(code)
    ? `status.listingRemoval.violation.${code}`
    : null;
}

/** Form hata anahtarı: `validation.listingRemoval.<issue>`. */
export function listingRemovalIssueI18nKey(issue: ListingRemovalIssue): string {
  return `validation.listingRemoval.${issue}`;
}

// ── Admin sözleşmeleri ───────────────────────────────────────────────────────

/** Admin liste filtresi: belirli bir neden ya da "nedeni bilinmiyor". */
export const LISTING_REMOVAL_REASON_FILTER_UNKNOWN = "unknown" as const;

export type ListingRemovalReasonFilter =
  ListingRemovalReason | typeof LISTING_REMOVAL_REASON_FILTER_UNKNOWN;

export function isListingRemovalReasonFilter(
  value: unknown,
): value is ListingRemovalReasonFilter {
  return (
    value === LISTING_REMOVAL_REASON_FILTER_UNKNOWN ||
    isListingRemovalReason(value)
  );
}

/**
 * Bir kaldırma kaydı (admin ürün detayı). `detail` satıcının/yöneticinin
 * serbest metnidir — YALNIZ admin uçları döndürür.
 */
export interface AdminListingRemovalEvent {
  id: string;
  reason: ListingRemovalReason;
  actor: ListingRemovalActor;
  platform: string | null;
  violationCode: string | null;
  detail: string | null;
  statusBefore: string;
  statusAfter: string;
  /**
   * İlan bu olaydan önce vitrinde miydi (bkz. {@link wasOnStorefront})?
   * `false` olaylar geçmişte görünür ama dashboard'da sayılmaz.
   */
  fromStorefront: boolean;
  actorUserId: string | null;
  createdAt: string;
}

/**
 * Listede ilanın GÜNCEL kaldırma özeti. Vitrindeki ilan için `null`;
 * vitrinden düşmüş ama nedeni kaydı olmayan (eski) ilan için `reason: null`.
 */
export interface AdminListingRemovalSummary {
  reason: ListingRemovalReason | null;
  actor: ListingRemovalActor | null;
  platform: string | null;
  violationCode: string | null;
  removedAt: string | null;
}

// ── Dashboard (Zone C: dönem kırılımı) ───────────────────────────────────────

export interface DashboardListingRemovalReasonCount {
  reason: ListingRemovalReason;
  actor: ListingRemovalActor;
  count: number;
}

export interface DashboardListingRemovalPlatformCount {
  /** Katalog dışı/boş değer `other` altında toplanır. */
  platform: ListingRemovalPlatform;
  count: number;
}

export interface DashboardListingRemovalViolationCount {
  /** `null` = kodsuz (eski istemciden gelen) yönetici reddi. */
  violationCode: string | null;
  count: number;
}

/**
 * `GET /admin/dashboard/listing-removals` — seçili dönemde (aynı dönem
 * seçicisi) gerçekleşen VİTRİNDEN DÜŞÜŞLER: yalnız `fromStorefront` olaylar
 * (ilan öncesinde vitrindeydi). Olay damgası = kaldırma anı; ilanın bugünkü
 * statüsü sayımı etkilemez. Vitrinden düşüp geri açılıp yeniden düşen ilan
 * iki olaydır; zaten vitrin dışındaki ilanın sonraki kaldırması (süresi
 * dolmuş ilanın silinmesi, reddedilmiş ilanın pasife alınması) sayılmaz.
 */
export interface DashboardListingRemovalsResponse {
  range: DashboardPeriodRange;
  total: number;
  /** Sıfır olanlar dahil her neden, katalog sırasıyla. */
  byReason: DashboardListingRemovalReasonCount[];
  /** `sold_elsewhere` olaylarının platform kırılımı (her platform, sıfır dahil). */
  soldElsewhereByPlatform: DashboardListingRemovalPlatformCount[];
  /** `policy_violation` olaylarının ihlal kodu kırılımı (yalnız görülen kodlar). */
  byViolation: DashboardListingRemovalViolationCount[];
}
