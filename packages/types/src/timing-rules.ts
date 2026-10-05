/**
 * SÜRELER VE KURALLAR — iş sürelerinin TEK kaydı (registry).
 *
 * Platformdaki her iş süresi (ilan ömrü, teklif geçerliliği, takas/sipariş/iade
 * pencereleri, ödeme zaman aşımları, operasyon alarm eşikleri) burada bir kez
 * tanımlanır: hangi PlatformSetting satırında durduğu, birimi, varsayılanı,
 * admin sınırları, ekran grubu ve süre dolunca ne olacağı (eylem).
 *
 * Değer çözümü (API, `common/timing-rules`): PlatformSetting satırı → eski env
 * değişkeni (`envKey`, yalnız ilk kurulum geri düşüşü) → buradaki `default`.
 * Admin bir değer kaydedene kadar deploy hiçbir şeyi değiştirmez.
 *
 * `@tarodan/types` içinde durur: API (çözüm + doğrulama) ve admin (ekran +
 * istemci doğrulaması) AYNI tanımı okur; sınırlar iki yerde yazılmaz.
 *
 * Eylemler: her kayıt bugünkü davranışı `defaultAction` olarak taşır. Sonraki
 * paketlerin ekleyeceği seçenekler (`available: false`) şimdiden listelenir —
 * admin seçicisinde "yakında" olarak devre dışı görünür, sunucu doğrudan
 * gönderilse bile reddeder. Bir seçeneği açmak = bayrağı çevirmek + davranışı
 * yazmak.
 */

export type TimingUnit = "minutes" | "hours" | "days";

/** Admin ekranındaki sekmeler — sıra ekrandaki sıradır. */
export const TIMING_GROUPS = [
  "listing",
  "offer",
  "trade",
  "order",
  "refund",
  "payment",
  "alerts",
] as const;
export type TimingGroup = (typeof TIMING_GROUPS)[number];

/** Süre dolunca uygulanabilecek eylemlerin tam sözlüğü. */
export const TIMING_EXPIRY_ACTIONS = [
  // İlan pasife alınır + satıcıya e-posta.
  "deactivate",
  // İlan süresi kendiliğinden yenilenir (sonraki paket).
  "auto_renew",
  // Satıcıya "süre doluyor" uyarısı gider.
  "notify_seller",
  // Kayıt `expired` olur + taraflara bildirim.
  "expire",
  // Süre bir kez uzatılır (sonraki paketler).
  "extend_once",
  // İşlem iptal edilir.
  "cancel",
  // İşlem iptal edilir, alınmış para iade edilir.
  "cancel_and_refund",
  // İşlem otomatik tamamlanır.
  "complete",
  // Tutulan para serbest bırakılır.
  "release_funds",
  // Stok rezervasyonu bırakılır (sipariş yaşamaya devam eder).
  "release_reservation",
  // Ödeme satırı başarısız sayılır.
  "fail_payment",
  // İade talebi kapatılır.
  "close_refund",
  // İade kesinleştirilir.
  "finalize_refund",
  // Admin alarmı / hatırlatması üretilir.
  "raise_alert",
] as const;
export type TimingExpiryAction = (typeof TIMING_EXPIRY_ACTIONS)[number];

export interface TimingActionOption {
  action: TimingExpiryAction;
  /**
   * false = sonraki bir pakette yazılacak davranış: admin seçicisinde "yakında"
   * olarak devre dışı görünür, sunucu kaydetmeyi reddeder.
   */
  available: boolean;
}

export interface TimingRuleDefinition {
  /** Sayıyı tutan PlatformSetting anahtarı (değişmez, veri sözleşmesidir). */
  settingKey: string;
  group: TimingGroup;
  unit: TimingUnit;
  /** Ayar ve env yokken geçerli değer — bugünkü kod varsayılanı. */
  default: number;
  /** Admin sınırları (dahil). Env geri düşüşüne uygulanmaz (bkz. docs). */
  min: number;
  max: number;
  /** Eski env değişkeni: yalnız ayar satırı yokken okunan ilk kurulum değeri. */
  envKey: string | null;
  /**
   * true = değişiklik SÜRMEKTE olan kayıtlara da uygulanır: süre kayda
   * damgalanmaz, her cron turu "şimdi − N" ile yeniden hesaplar (ör. ilan
   * ömrü). false = süre olay anında kayda yazılır; değişiklik yalnız yeni
   * kayıtları etkiler. Admin ekranı true olan satırlarda uyarı gösterir.
   */
  appliesToInProgress: boolean;
  actions: readonly TimingActionOption[];
  defaultAction: TimingExpiryAction;
}

/**
 * PayTR 3DS oturumunun süresi (dk). Ödeme satırını `failed` yapma penceresi bu
 * sürenin ALTINA ya da EŞİNE inemez: kullanıcı OTP ekranındayken satır failed
 * olursa PayTR'nin geç gelen başarılı bildirimi siparişe bağlanamaz (orphan
 * capture).
 */
export const PAYTR_3DS_SESSION_MINUTES = 30;

/** Tek eylemli kayıt. */
const only = (
  action: TimingExpiryAction,
): Pick<TimingRuleDefinition, "actions" | "defaultAction"> => ({
  actions: [{ action, available: true }],
  defaultAction: action,
});

/** Bugünkü davranış + sonraki paketlere ayrılmış (henüz kapalı) seçenekler. */
const withLater = (
  action: TimingExpiryAction,
  ...later: TimingExpiryAction[]
): Pick<TimingRuleDefinition, "actions" | "defaultAction"> => ({
  actions: [
    { action, available: true },
    ...later.map((next) => ({ action: next, available: false })),
  ],
  defaultAction: action,
});

export const TIMING_RULES = {
  // ── İlan ──────────────────────────────────────────────────────────────
  /** İlanın yayında kalma süresi (yayın anından, her onayda tazelenir). */
  listingTtlDays: {
    settingKey: "listing_ttl_days",
    group: "listing",
    unit: "days",
    default: 60,
    min: 7,
    max: 365,
    envKey: "LISTING_TTL_DAYS",
    appliesToInProgress: true,
    ...withLater("deactivate", "auto_renew"),
  },
  /** İlan süresi dolmadan kaç gün önce satıcı uyarılır. */
  listingExpiryWarningDays: {
    settingKey: "listing_expiry_warning_days",
    group: "listing",
    unit: "days",
    default: 7,
    min: 1,
    max: 30,
    envKey: null,
    appliesToInProgress: true,
    ...only("notify_seller"),
  },

  // ── Teklif ────────────────────────────────────────────────────────────
  /** Teklifin (ve karşı teklifin) geçerlilik süresi. */
  offerExpiryHours: {
    settingKey: "offer_expiry_hours",
    group: "offer",
    unit: "hours",
    default: 24,
    min: 1,
    max: 168,
    envKey: "OFFER_EXPIRY_HOURS",
    appliesToInProgress: false,
    ...withLater("expire", "extend_once"),
  },

  // ── Takas ─────────────────────────────────────────────────────────────
  /** Takas teklifine yanıt süresi. */
  tradeResponseHours: {
    settingKey: "trade_response_deadline_hours",
    group: "trade",
    unit: "hours",
    default: 72,
    min: 1,
    max: 336,
    envKey: null,
    appliesToInProgress: false,
    ...withLater("cancel", "extend_once"),
  },
  /** Kabul sonrası takas ödemesi süresi. */
  tradePaymentHours: {
    settingKey: "trade_payment_deadline_hours",
    group: "trade",
    unit: "hours",
    default: 48,
    min: 1,
    max: 336,
    envKey: null,
    appliesToInProgress: false,
    ...withLater("cancel", "extend_once"),
  },
  /** Ödeme sonrası ürünlerin depoya kargolanma süresi. */
  tradeShippingDays: {
    settingKey: "trade_shipping_deadline_days",
    group: "trade",
    unit: "days",
    default: 7,
    min: 1,
    max: 30,
    envKey: null,
    appliesToInProgress: false,
    ...only("cancel_and_refund"),
  },
  /** Teslimattan sonra tarafların onay/itiraz penceresi. */
  tradeConfirmationDays: {
    settingKey: "trade_confirmation_deadline_days",
    group: "trade",
    unit: "days",
    default: 3,
    min: 1,
    max: 30,
    envKey: null,
    appliesToInProgress: false,
    ...only("complete"),
  },
  /** Takas tamamlandıktan sonra nakit farkın açılma süresi (en az 1). */
  tradeHoldDays: {
    settingKey: "payment_hold_days",
    group: "trade",
    unit: "days",
    default: 3,
    min: 1,
    max: 30,
    envKey: null,
    appliesToInProgress: false,
    ...only("release_funds"),
  },
  /** Depoya varmayan koli için bekleme; çıkış kolisi teslim alarmı da bunu okur. */
  tradeLostParcelGraceDays: {
    settingKey: "trade_lost_parcel_grace_days",
    group: "trade",
    unit: "days",
    default: 14,
    min: 1,
    max: 90,
    envKey: "TRADE_LOST_PARCEL_GRACE_DAYS",
    appliesToInProgress: true,
    ...only("cancel_and_refund"),
  },

  // ── Sipariş ───────────────────────────────────────────────────────────
  /** Satıcının siparişi kargoya verme süresi (pazar sayılmaz). */
  preparingDeadlineDays: {
    settingKey: "preparing_deadline_days",
    group: "order",
    unit: "days",
    default: 3,
    min: 1,
    max: 14,
    envKey: "PREPARING_DEADLINE_DAYS",
    appliesToInProgress: false,
    ...withLater("cancel_and_refund", "extend_once"),
  },
  /**
   * Teslimden sonraki koşulsuz cayma (iade talep) penceresi. Mesafeli Satış
   * Yönetmeliği gereği 14 günün altına inemez. Pencere sonu teslimde siparişe
   * damgalanır (`Order.returnWindowEndsAt`); iade uygunluğu, tamamlanma ve
   * escrow aynı damgayı okur. Yalnız damgadan önce teslim edilmiş eski
   * siparişler bugünkü değerle hesaplanır.
   */
  returnWindowDays: {
    settingKey: "return_window_days",
    group: "order",
    unit: "days",
    default: 14,
    min: 14,
    max: 90,
    envKey: "RETURN_WINDOW_DAYS",
    appliesToInProgress: false,
    ...only("complete"),
  },

  // ── Ödeme ─────────────────────────────────────────────────────────────
  /** Sipariş oluşunca alıcının ödeme süresi (dolunca sipariş iptal). */
  orderPaymentWindowHours: {
    settingKey: "order_payment_window_hours",
    group: "payment",
    unit: "hours",
    default: 24,
    min: 1,
    max: 168,
    envKey: "ORDER_PAYMENT_WINDOW_HOURS",
    appliesToInProgress: false,
    ...only("cancel"),
  },
  /** Ödenmemiş siparişin stok rezervasyonunu tutma süresi. */
  paymentReservationMinutes: {
    settingKey: "payment_reservation_minutes",
    group: "payment",
    unit: "minutes",
    default: 5,
    min: 1,
    max: 60,
    envKey: "PAYMENT_TIMEOUT_MINUTES",
    appliesToInProgress: true,
    ...only("release_reservation"),
  },
  /** Bekleyen ödeme satırını `failed` yapma penceresi (PayTR oturumundan uzun). */
  paymentFailTimeoutMinutes: {
    settingKey: "payment_fail_timeout_minutes",
    group: "payment",
    unit: "minutes",
    default: 35,
    min: PAYTR_3DS_SESSION_MINUTES + 1,
    max: 240,
    envKey: "PAYMENT_FAIL_TIMEOUT_MINUTES",
    appliesToInProgress: true,
    ...only("fail_payment"),
  },
  /** İade penceresi kapandıktan sonra satıcı ödemesinden önceki bekleme (en az 1). */
  payoutGraceDays: {
    settingKey: "payout_grace_days",
    group: "payment",
    unit: "days",
    default: 1,
    min: 1,
    max: 30,
    envKey: "PAYOUT_GRACE_DAYS",
    appliesToInProgress: false,
    ...only("release_funds"),
  },

  // ── İade ──────────────────────────────────────────────────────────────
  /** Onaylı iadenin koli olarak kargoya verilme süresi. */
  returnDropoffDays: {
    settingKey: "refund_return_dropoff_days",
    group: "refund",
    unit: "days",
    default: 14,
    min: 1,
    max: 60,
    envKey: "REFUND_RETURN_DROPOFF_DAYS",
    appliesToInProgress: true,
    ...only("close_refund"),
  },
  /** Takip doğrulanamasa bile iadenin kapatılacağı üst sınır (emniyet supabı). */
  returnDropoffHardDays: {
    settingKey: "refund_return_dropoff_hard_days",
    group: "refund",
    unit: "days",
    default: 21,
    min: 1,
    max: 120,
    envKey: "REFUND_RETURN_DROPOFF_HARD_DAYS",
    appliesToInProgress: true,
    ...only("close_refund"),
  },
  /** Satıcıya teslim edilen iade kolisinin inceleme süresi. */
  returnInspectionHours: {
    settingKey: "refund_return_inspection_hours",
    group: "refund",
    unit: "hours",
    default: 24,
    min: 1,
    max: 168,
    envKey: "REFUND_RETURN_INSPECTION_HOURS",
    appliesToInProgress: true,
    ...only("finalize_refund"),
  },
  /** Orijinal sipariş teslim edilmeyen (wait_for_delivery) iadenin üst süresi. */
  refundWaitDeliveryMaxDays: {
    settingKey: "refund_wait_delivery_max_days",
    group: "refund",
    unit: "days",
    default: 30,
    min: 1,
    max: 180,
    envKey: "REFUND_WAIT_DELIVERY_MAX_DAYS",
    appliesToInProgress: true,
    ...only("close_refund"),
  },

  // ── Operasyon alarmları ───────────────────────────────────────────────
  /** Kargoda takılı sipariş alarmı (kargoya verilişten). */
  shippedStaleAlertDays: {
    settingKey: "shipped_stale_alert_days",
    group: "alerts",
    unit: "days",
    default: 10,
    min: 1,
    max: 90,
    envKey: "SHIPPED_STALE_ALERT_DAYS",
    appliesToInProgress: true,
    ...only("raise_alert"),
  },
  /** Taşıyıcı kodu oluşmamış gönderi alarmı. */
  missingTrackingAlertHours: {
    settingKey: "missing_tracking_alert_hours",
    group: "alerts",
    unit: "hours",
    default: 24,
    min: 1,
    max: 720,
    envKey: "MISSING_TRACKING_ALERT_HOURS",
    appliesToInProgress: true,
    ...only("raise_alert"),
  },
  /** Elle kapatılması gereken taşıyıcı iptal görevi alarmı. */
  carrierCancellationAlertHours: {
    settingKey: "carrier_cancellation_alert_hours",
    group: "alerts",
    unit: "hours",
    default: 24,
    min: 1,
    max: 720,
    envKey: "CARRIER_CANCELLATION_ALERT_HOURS",
    appliesToInProgress: true,
    ...only("raise_alert"),
  },
  /** Teslim edilmiş siparişin gelir faturası kesilmeden kalabileceği süre. */
  invoiceDeadlineDays: {
    settingKey: "invoice_deadline_days",
    group: "alerts",
    unit: "days",
    default: 5,
    min: 1,
    max: 30,
    envKey: "INVOICE_DEADLINE_DAYS",
    appliesToInProgress: true,
    ...only("raise_alert"),
  },
  /** Satıcının ürün faturasını yüklemesi beklenen süre (hatırlatma + alarm). */
  sellerInvoiceDeadlineDays: {
    settingKey: "seller_invoice_deadline_days",
    group: "alerts",
    unit: "days",
    default: 7,
    min: 1,
    max: 60,
    envKey: "SELLER_INVOICE_DEADLINE_DAYS",
    appliesToInProgress: true,
    ...only("raise_alert"),
  },
  /** "Kargoya verdim" denip taşıyıcıdan hiç veri gelmeyen gönderi alarmı. */
  cargoPickupNoDataDays: {
    settingKey: "cargo_pickup_no_data_days",
    group: "alerts",
    unit: "days",
    default: 3,
    min: 1,
    max: 30,
    envKey: "CARGO_PICKUP_NO_DATA_DAYS",
    appliesToInProgress: true,
    ...only("raise_alert"),
  },
  /** Hareketsiz kalan kargo alarmı. */
  cargoStaleMovementDays: {
    settingKey: "cargo_stale_movement_days",
    group: "alerts",
    unit: "days",
    default: 14,
    min: 1,
    max: 90,
    envKey: "CARGO_STALE_MOVEMENT_DAYS",
    appliesToInProgress: true,
    ...only("raise_alert"),
  },
} satisfies Record<string, TimingRuleDefinition>;

export type TimingRuleId = keyof typeof TIMING_RULES;

/** Kayıtların tanım sırası — ekran satırları bu sırayı izler. */
export const TIMING_RULE_IDS = Object.keys(TIMING_RULES) as TimingRuleId[];

/** Kayda tip güvenli erişim (ID'yi string'den çözmek için `isTimingRuleId`). */
export function timingRule(id: TimingRuleId): TimingRuleDefinition {
  return TIMING_RULES[id];
}

export function isTimingRuleId(value: string): value is TimingRuleId {
  return Object.prototype.hasOwnProperty.call(TIMING_RULES, value);
}

/** Bir grubun kayıtları, tanım sırasıyla. */
export function timingRulesInGroup(group: TimingGroup): TimingRuleId[] {
  return TIMING_RULE_IDS.filter((id) => TIMING_RULES[id].group === group);
}

/** Seçilen eylemi tutan PlatformSetting anahtarı. */
export function timingActionSettingKey(id: TimingRuleId): string {
  return `${TIMING_RULES[id].settingKey}_on_expiry`;
}

/**
 * Kayıt sistemine ait TÜM PlatformSetting anahtarları (değer + eylem). Genel
 * ayar ucu bunlara yazmayı reddeder: tek yazma yolu doğrulamalı ve denetim
 * kayıtlı Süreler ve Kurallar ucudur.
 */
export function isTimingSettingKey(settingKey: string): boolean {
  return TIMING_RULE_IDS.some(
    (id) =>
      TIMING_RULES[id].settingKey === settingKey ||
      timingActionSettingKey(id) === settingKey,
  );
}

/** Eylem bu kayıtta tanımlı VE şu an seçilebilir mi. */
export function isSelectableTimingAction(
  id: TimingRuleId,
  action: string,
): action is TimingExpiryAction {
  return TIMING_RULES[id].actions.some(
    (option) => option.action === action && option.available,
  );
}

/**
 * Alanlar arası değişmezler: `lower` her zaman `upper`'dan küçük (strict) ya da
 * küçük-eşit kalmalı. İki tarafın birimi aynıdır.
 */
export interface TimingRuleInvariant {
  id: "dropoffHardNotBelowDropoff" | "listingWarningBeforeTtl";
  lower: TimingRuleId;
  upper: TimingRuleId;
  strict: boolean;
}
export type TimingInvariantId = TimingRuleInvariant["id"];

export const TIMING_RULE_INVARIANTS: readonly TimingRuleInvariant[] = [
  // Emniyet supabı normal drop-off penceresinden kısa olamaz: kısa olursa
  // takibi doğrulanmamış iade, alıcının hakkı daha sürerken kapatılırdı.
  {
    id: "dropoffHardNotBelowDropoff",
    lower: "returnDropoffDays",
    upper: "returnDropoffHardDays",
    strict: false,
  },
  // Uyarı, ilan süresinin İÇİNDE bir güne düşmeli; aksi halde uyarı bandı
  // ilanın yayın gününden önceye kayar ve hiçbir ilan uyarı almaz.
  {
    id: "listingWarningBeforeTtl",
    lower: "listingExpiryWarningDays",
    upper: "listingTtlDays",
    strict: true,
  },
];

export type TimingRuleViolation =
  | { code: "notInteger" }
  | { code: "belowMin"; min: number }
  | { code: "aboveMax"; max: number }
  | { code: "invariant"; invariant: TimingInvariantId; other: TimingRuleId }
  | { code: "actionNotAllowed" }
  | { code: "actionUnavailable" };

/** Tek değerin kendi kuralları: tam sayı + kayıt sınırları. */
export function validateTimingValue(
  id: TimingRuleId,
  value: number,
): TimingRuleViolation | null {
  const rule = TIMING_RULES[id];
  if (!Number.isInteger(value)) return { code: "notInteger" };
  if (value < rule.min) return { code: "belowMin", min: rule.min };
  if (value > rule.max) return { code: "aboveMax", max: rule.max };
  return null;
}

/** Eylem bu kayıtta var mı, varsa şu an seçilebilir mi. */
export function validateTimingAction(
  id: TimingRuleId,
  action: string,
): TimingRuleViolation | null {
  const option = TIMING_RULES[id].actions.find((o) => o.action === action);
  if (!option) return { code: "actionNotAllowed" };
  if (!option.available) return { code: "actionUnavailable" };
  return null;
}

/**
 * Değişen kayıtlara dokunan değişmezleri, ADAY değer kümesi üzerinde denetler.
 * `values` değişiklikler uygulanmış haldir; ihlal, değişen kayıt adına döner.
 */
export function findTimingInvariantViolation(
  values: Readonly<Record<TimingRuleId, number>>,
  changed: readonly TimingRuleId[],
): { id: TimingRuleId; violation: TimingRuleViolation } | null {
  for (const invariant of TIMING_RULE_INVARIANTS) {
    const lowerChanged = changed.includes(invariant.lower);
    const upperChanged = changed.includes(invariant.upper);
    if (!lowerChanged && !upperChanged) continue;
    const lower = values[invariant.lower];
    const upper = values[invariant.upper];
    const holds = invariant.strict ? lower < upper : lower <= upper;
    if (holds) continue;
    const id = lowerChanged ? invariant.lower : invariant.upper;
    const other = lowerChanged ? invariant.upper : invariant.lower;
    return {
      id,
      violation: { code: "invariant", invariant: invariant.id, other },
    };
  }
  return null;
}

/**
 * İhlalin katalog anahtarı + parametreleri. API 400 mesajı ve admin form
 * hatası AYNI anahtarı kullanır (metin bir kez yazılır). Anahtarlar
 * `@tarodan/i18n` kataloğundaki `server.admin.timingRules.*` dalındadır.
 */
export type TimingViolationMessageKey =
  | "server.admin.timingRules.notInteger"
  | "server.admin.timingRules.belowMin"
  | "server.admin.timingRules.aboveMax"
  | `server.admin.timingRules.invariant.${TimingInvariantId}`
  | "server.admin.timingRules.actionNotAllowed"
  | "server.admin.timingRules.actionUnavailable";

export interface TimingViolationMessage {
  key: TimingViolationMessageKey;
  params?: { min: number } | { max: number };
}

export function describeTimingViolation(
  violation: TimingRuleViolation,
): TimingViolationMessage {
  switch (violation.code) {
    case "notInteger":
      return { key: "server.admin.timingRules.notInteger" };
    case "belowMin":
      return {
        key: "server.admin.timingRules.belowMin",
        params: { min: violation.min },
      };
    case "aboveMax":
      return {
        key: "server.admin.timingRules.aboveMax",
        params: { max: violation.max },
      };
    case "invariant":
      return {
        key: `server.admin.timingRules.invariant.${violation.invariant}`,
      };
    case "actionNotAllowed":
      return { key: "server.admin.timingRules.actionNotAllowed" };
    case "actionUnavailable":
      return { key: "server.admin.timingRules.actionUnavailable" };
  }
}

// ── API sözleşmeleri ─────────────────────────────────────────────────────

/** Etkin değerin nereden geldiği: admin ayarı, env geri düşüşü, kayıt varsayılanı. */
export type TimingValueSource = "setting" | "env" | "default";

/** `GET /admin/timing-rules` satırı. Meta (birim, sınır, eylemler) kayıttan okunur. */
export interface AdminTimingRuleState {
  id: TimingRuleId;
  value: number;
  source: TimingValueSource;
  /**
   * Etkin değer admin sınırlarının dışında (ör. eski env değeri). Değer
   * uygulanmaya devam eder; ekran bunu düzeltilebilir bir uyarı olarak gösterir.
   */
  outOfBounds: boolean;
  action: TimingExpiryAction;
  /** Değer ya da eylem satırının son admin güncellemesi; hiç yoksa null. */
  updatedAt: string | null;
}

export interface AdminTimingRulesResponse {
  rules: AdminTimingRuleState[];
}

export interface TimingRuleChange {
  id: TimingRuleId;
  value?: number;
  action?: TimingExpiryAction;
}

/** `PATCH /admin/timing-rules` gövdesi — birden çok kayıt tek seferde, atomik. */
export interface UpdateTimingRulesRequest {
  changes: TimingRuleChange[];
}

/**
 * Ön yüzlerin (web, mobil) ihtiyaç duyduğu, hassas olmayan politika süreleri.
 * Yalnız bu listedekiler herkese açık uçtan döner; alarm eşikleri ve ödeme
 * zaman aşımları gibi iç değerler dönmez.
 */
export const PUBLIC_TIMING_RULE_IDS = [
  "listingTtlDays",
  "listingExpiryWarningDays",
  "offerExpiryHours",
  "tradeResponseHours",
  "tradePaymentHours",
  "tradeShippingDays",
  "tradeConfirmationDays",
  "tradeHoldDays",
  "preparingDeadlineDays",
  "returnWindowDays",
  "orderPaymentWindowHours",
  "payoutGraceDays",
  "returnDropoffDays",
  "returnInspectionHours",
] as const satisfies readonly TimingRuleId[];
export type PublicTimingRuleId = (typeof PUBLIC_TIMING_RULE_IDS)[number];

/** `GET /timing-rules` yanıtı. */
export type PublicTimingPolicy = Record<
  PublicTimingRuleId,
  { value: number; unit: TimingUnit }
>;
