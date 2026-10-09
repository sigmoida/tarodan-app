import { SYSTEM_GUEST_EMAIL } from "../../../modules/elogo/invoice/elogo-guest-recipient";
import { ANONYMIZED_EMAIL_PATTERN } from "../deleted-user-identity";
import { PLATFORM_EMAIL } from "../seed-uat-accounts";

/**
 * UAT MASKELEME KATALOĞU — production kopyasındaki her kişisel/gizli kolonun
 * staging'e nasıl taşındığının TEK kaynağı (docs/UAT_REFRESH.md).
 *
 * `prisma/uat/mask-database.ts` bu listeyi sırayla, küme bazlı SQL ile uygular;
 * `masking-catalog.contract.spec.ts` schema.prisma'yı okuyup kişisel veri adı
 * taşıyan (ve her JSON) kolonun ya burada bir kuralı ya da aşağıdaki gerekçeli
 * izin listesinde bir satırı olduğunu doğrular — yeni bir kolon sessizce
 * staging'e sızamaz.
 *
 * Adlar SQL adlarıdır (`@@map` / `@map`), Prisma alan adları değil.
 *
 * Kararlar:
 *  - Oturum, doğrulama kodu, OAuth bağı, 2FA sırrı, kayıtlı kart (canlı PayTR
 *    token'ı), push token'ı (gerçek cihaz!) ve gönderici posta kutuları
 *    (şifrelenmiş canlı şifreler) SİLİNİR.
 *  - Bekleyen yan etkiler (outbox, iç bildirim) ve log tabloları (e-posta,
 *    bildirim, hata) SİLİNİR: staging canlıda yarım kalmış bir işi gerçek
 *    adreslere yeniden oynatmasın.
 *  - Kimlik kolonları satır id'sinden türeyen sahte değere döner; mesaj ve not
 *    metinleri KORUNUR, içlerindeki e-posta/telefon/IBAN/TCKN temizlenir.
 *  - Sipariş/fatura/PayTR numaraları, tutarlar ve görsel URL'leri aynen kalır
 *    (sahip kararı). Görseller production'dan salt okunur; yazmalar staging'in
 *    S3 önekine gider.
 */

/** Sahte değer üreticisi (`masking-fakes.ts`). */
export type FakeKind =
  | "email"
  | "phone"
  | "tckn"
  | "taxId"
  | "iban"
  | "firstName"
  | "lastName"
  | "fullName"
  | "street"
  | "companyName"
  | "username"
  | "birthDate"
  | "token"
  | "fileName";

/**
 * Asıl değeri OKUYAN üreticiler. Tekil kolonlarda kullanılamazlar: tekil
 * kolonlar önce geçici değere çekilir (bkz. `masking-sql.ts`), asıl değer o
 * noktada artık okunamaz.
 */
export const ORIGINAL_DEPENDENT_FAKES: readonly FakeKind[] = [
  "taxId",
  "fileName",
];

export type ColumnRule =
  /** NULL'a çek (kolon nullable olmalı). */
  | { strategy: "null" }
  /** Sabit SQL ifadesi (ör. `false`, `'[]'::jsonb`). */
  | { strategy: "constant"; sql: string }
  /**
   * Satır anahtarından sahte değer. `key` tablo anahtarını ezer (ör. adres
   * alıcı adı kullanıcının adıyla aynı olsun diye `user_id`). `unique` = kolon
   * tekil indeksli: önce geçici değere çekilir, çakışma denemeyle çözülür.
   */
  | { strategy: "fake"; fake: FakeKind; key?: string; unique?: boolean }
  /** JSON'u derinlemesine temizle (`scrubJson`). */
  | { strategy: "json"; key?: string }
  /** Metni koru, içindeki e-posta/telefon/IBAN/TCKN'yi değiştir. */
  | { strategy: "freeText"; key?: string };

export interface DeleteRowsRule {
  table: string;
  action: "deleteRows";
  reason: string;
}

export interface MaskColumnsRule {
  table: string;
  action: "mask";
  reason: string;
  /** Sahte değerlerin varsayılan anahtar kolonu (varsayılan `id`). */
  keyColumn?: string;
  /** Hiç dokunulmayacak satırlar (SQL yüklemi). */
  keepWhere?: string;
  columns: Record<string, ColumnRule>;
}

export type MaskRule = DeleteRowsRule | MaskColumnsRule;

const sqlLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * Sistem hesapları maskelenmez: kod onları e-postayla bulur (platform satıcısı,
 * misafir siparişlerinin ortak kullanıcısı) ve silinmiş hesaplar zaten
 * anonimdir. Liste dar tutulur: gerçek bir kişi buraya giremez.
 */
export const UAT_MASK_KEPT_SYSTEM_EMAILS: readonly string[] = [
  PLATFORM_EMAIL,
  SYSTEM_GUEST_EMAIL,
];

export const USERS_SYSTEM_ROW_SQL =
  `("email" IN (${UAT_MASK_KEPT_SYSTEM_EMAILS.map(sqlLiteral).join(", ")})` +
  ` OR "email" ~* ${sqlLiteral(ANONYMIZED_EMAIL_PATTERN.source)})`;

const fake = (
  kind: FakeKind,
  options: { key?: string; unique?: boolean } = {},
): ColumnRule => ({ strategy: "fake", fake: kind, ...options });
const NULL: ColumnRule = { strategy: "null" };
const JSON_SCRUB: ColumnRule = { strategy: "json" };
const FREE_TEXT: ColumnRule = { strategy: "freeText" };

const deleteRows = (table: string, reason: string): DeleteRowsRule => ({
  table,
  action: "deleteRows",
  reason,
});

/** Uygulama sırası önemli: FK'li bağlar silinen tablodan ÖNCE çözülür. */
export const UAT_MASKING_CATALOG: readonly MaskRule[] = [
  // ─── Kimlik doğrulama ve oturum: tamamen silinir ───────────────────────────
  deleteRows("oauth_accounts", "Gerçek Google/Apple kimliklerine bağ; staging'de gerçek kişi sosyal girişle hesaba düşmesin."),
  deleteRows("two_factor_secrets", "2FA sırları."),
  deleteRows("password_reset_tokens", "Tek kullanımlık sıfırlama bağlantıları."),
  deleteRows("email_verification_tokens", "Doğrulama bağlantıları + gerçek adres."),
  deleteRows("phone_verification_tokens", "Doğrulama kodu + gerçek telefon."),
  deleteRows("email_change_tokens", "Bekleyen e-posta değişikliği + gerçek yeni adres."),
  deleteRows("refresh_tokens", "Canlı oturumlar (+ IP)."),
  deleteRows("admin_sessions", "Canlı personel oturumları (+ IP)."),
  deleteRows("csrf_tokens", "Oturuma bağlı CSRF token'ları."),
  deleteRows("push_tokens", "Gerçek cihazların push token'ı: staging bir bildirimi müşterinin telefonuna göndermesin."),
  deleteRows("saved_cards", "Canlı PayTR mağazasının kart token'ları (utoken/ctoken) + onay IP'si."),

  // ─── Yan etki kuyrukları ve loglar: silinir ────────────────────────────────
  deleteRows("outbox_events", "Canlıda bekleyen yan etkiler staging'de yeniden oynatılmaz."),
  deleteRows("mail_internal_notices", "Personel iç bildirimleri (gönderilmemiş olanlar staging alıcılarına gitmesin)."),
  deleteRows("email_logs", "Gönderim geçmişi: alıcı adresleri gerçek."),
  deleteRows("notification_logs", "Bildirim geçmişi: metinler karşı tarafın adını taşır."),
  deleteRows("error_logs", "Hata ayrıntıları istek gövdesinden kişisel veri taşıyabilir."),
  deleteRows("cache_entries", "Canlıdan kalma önbellek."),
  deleteRows("uat_refresh_runs", "Production'da yenileme koşusu olmaz; staging'in kendi geçmişini workflow taşır."),

  // ─── Mail Yönlendirme: canlı kutular silinir (staging'inkini workflow taşır)
  {
    table: "mail_area_settings",
    action: "mask",
    reason: "Silinecek gönderici kutularına bağ (RESTRICT) ve iç alıcı adresleri.",
    columns: {
      sender_account_id: NULL,
      reply_to: NULL,
      internal_recipients: { strategy: "constant", sql: "'[]'::jsonb" },
    },
  },
  deleteRows("mail_sender_accounts", "Canlı posta kutularının şifrelenmiş şifreleri."),

  // ─── Kişiler ───────────────────────────────────────────────────────────────
  {
    table: "users",
    action: "mask",
    reason: "Kimlik, iletişim ve şirket bilgisi; sistem hesapları korunur.",
    keepWhere: USERS_SYSTEM_ROW_SQL,
    columns: {
      email: fake("email", { unique: true }),
      phone: fake("phone", { unique: true }),
      username: fake("username", { unique: true }),
      display_name: fake("fullName"),
      legal_first_name: fake("firstName"),
      legal_last_name: fake("lastName"),
      national_id: fake("tckn", { unique: true }),
      birth_date: fake("birthDate"),
      tax_id: fake("taxId"),
      company_name: fake("companyName", { unique: true }),
    },
  },
  {
    table: "users",
    action: "mask",
    reason: "Şifre ve cihaz token'ı HER satırda (sistem hesapları dahil) silinir.",
    columns: { password_hash: NULL, fcm_token: NULL },
  },
  {
    table: "admin_users",
    action: "mask",
    reason: "Son giriş IP'si; 2FA sırları silindiği için bayrak da kapanır.",
    columns: {
      last_login_ip: NULL,
      two_factor_enabled: { strategy: "constant", sql: "false" },
    },
  },
  {
    table: "deleted_user_identities",
    action: "mask",
    reason: "Silinen hesapların yasal kimlik arşivi (tetikleyicisi maskeleme süresince kapalı).",
    keyColumn: "user_id",
    columns: {
      email: fake("email"),
      username: fake("username"),
      display_name: fake("fullName"),
      legal_first_name: fake("firstName"),
      legal_last_name: fake("lastName"),
      phone: fake("phone"),
      birth_date: fake("birthDate"),
      national_id: fake("tckn"),
      tax_id: fake("taxId"),
      company_name: fake("companyName"),
      address_line: fake("street"),
      iban: fake("iban"),
      bank_account_holder: fake("fullName"),
      source_detail: JSON_SCRUB,
      source_refs: JSON_SCRUB,
    },
  },
  {
    table: "consent_records",
    action: "mask",
    reason: "Misafir e-postası, IP ve tarayıcı (tetikleyicisi maskeleme süresince kapalı).",
    columns: {
      guest_email: fake("email"),
      ip_address: NULL,
      user_agent: NULL,
      details: JSON_SCRUB,
    },
  },
  {
    table: "corporate_applications",
    action: "mask",
    reason: "Kurumsal başvuru: yetkili, şirket iletişim ve banka bilgisi.",
    columns: {
      authorized_full_name: fake("fullName"),
      company_legal_name: fake("companyName"),
      company_title: fake("companyName"),
      company_address: fake("street"),
      company_email: fake("email"),
      kep_address: fake("email"),
      phone: fake("phone"),
      contact_phone: fake("phone"),
      tax_id: fake("taxId"),
      bank_account_holder: fake("fullName"),
      iban: fake("iban"),
      invitation_token_hash: NULL,
      review_note: FREE_TEXT,
    },
  },
  {
    table: "corporate_stakeholders",
    action: "mask",
    reason: "Ortak/yetkili kişilerin adı ve kimlik numarası.",
    columns: { full_name: fake("fullName"), identity_number: fake("tckn") },
  },
  {
    table: "corporate_application_events",
    action: "mask",
    reason: "Başvuru geçmişindeki notlar ve meta veri.",
    columns: { note: FREE_TEXT, metadata: JSON_SCRUB },
  },
  {
    table: "newsletter_subscribers",
    action: "mask",
    reason: "Bülten abonesi adresleri (üye olmayanlar dahil).",
    columns: {
      email: fake("email", { unique: true }),
      unsubscribe_token: fake("token", { unique: true }),
    },
  },
  {
    table: "addresses",
    action: "mask",
    reason: "Alıcı adı (kullanıcının sahte adıyla aynı), telefon ve açık adres. İl/ilçe kalır: kargo tarifesi onlara bakıyor.",
    columns: {
      full_name: fake("fullName", { key: "user_id" }),
      phone: fake("phone"),
      address: fake("street"),
      zip_code: NULL,
    },
  },
  {
    table: "seller_bank_accounts",
    action: "mask",
    reason: "Satıcı banka hesabı; kullanıcı id'siyle anahtarlanır ki hesap sahibi kullanıcının sahte yasal adıyla eşleşsin.",
    keyColumn: "user_id",
    columns: {
      account_holder: fake("fullName"),
      iban: fake("iban"),
      tc_kimlik_no: fake("tckn"),
      tax_id: fake("taxId"),
    },
  },
  {
    table: "seller_documents",
    action: "mask",
    reason: "Yüklenen belge adı (kişi adı içerebilir) ve inceleme notları. Dosyanın kendisi production önekinde; staging onu okuyamaz.",
    columns: {
      file_name: fake("fileName"),
      review_note: FREE_TEXT,
      appeal_note: FREE_TEXT,
    },
  },

  // ─── Para ve sağlayıcı kayıtları (tutarlar/numaralar aynen kalır) ─────────
  {
    table: "payout_transfers",
    action: "mask",
    reason: "Ödeme yapılan IBAN ve ad; satıcı id'siyle anahtarlanır (banka hesabıyla tutarlı).",
    keyColumn: "seller_id",
    columns: {
      transfer_iban: fake("iban"),
      transfer_name: fake("fullName"),
      provider_response: JSON_SCRUB,
    },
  },
  {
    table: "payment_provider_events",
    action: "mask",
    reason: "PayTR kart kullanıcı token'ı ve ham bildirim.",
    columns: { utoken: NULL, raw: JSON_SCRUB },
  },
  ...(
    [
      ["payments", "metadata"],
      ["refund_attempts", "provider_response"],
      ["membership_payments", "metadata"],
      ["paytr_statement_lines", "raw"],
      ["paytr_settlements", "raw"],
      ["paytr_settlement_items", "raw"],
      ["seller_account_adjustments", "metadata"],
      ["refund_financial_components", "metadata"],
      ["carrier_cancellation_tasks", "metadata"],
      ["ledger_entries", "metadata"],
      ["scheduled_notifications", "target_data"],
    ] as const
  ).map(
    ([table, column]): MaskColumnsRule => ({
      table,
      action: "mask",
      reason: "Sağlayıcı yanıtı / meta veri: ad, adres, e-posta, IP gömebilir.",
      columns: { [column]: JSON_SCRUB },
    }),
  ),
  {
    table: "orders",
    action: "mask",
    reason: "Teslimat/fatura adresi anlık görüntüsü (misafirin adı, e-postası, telefonu) ve finans görüntüsündeki adlar.",
    columns: {
      shipping_address: JSON_SCRUB,
      financial_snapshot: JSON_SCRUB,
      cancel_reason: FREE_TEXT,
    },
  },
  {
    table: "elogo_invoices",
    action: "mask",
    reason: "Fatura alıcısının kimliği ve adresi. Fatura numarası/ETTN aynen kalır.",
    columns: {
      recipient_vkn_tckn: fake("taxId"),
      recipient_name: fake("fullName"),
      recipient_email: fake("email"),
      recipient_street: fake("street"),
    },
  },
  {
    table: "invoices",
    action: "mask",
    reason: "Serbest not.",
    columns: { notes: FREE_TEXT },
  },

  // ─── Kargo ─────────────────────────────────────────────────────────────────
  {
    table: "shipments",
    action: "mask",
    reason: "Etiket (alıcının adı/adresi/telefonu basılı) ve teslim alan kişinin adı.",
    columns: {
      label_zpl: NULL,
      label_url: NULL,
      received_by: fake("fullName"),
    },
  },
  {
    table: "trade_shipments",
    action: "mask",
    reason: "Takas kolisi etiketi (alıcı bilgisi basılı).",
    columns: { label_zpl: NULL },
  },

  // ─── Serbest metin: metin kalır, iletişim bilgisi temizlenir ──────────────
  ...(
    [
      ["messages", ["content", "filtered_content"]],
      ["trade_messages", ["content"]],
      ["ticket_messages", ["content"]],
      ["support_tickets", ["subject"]],
      ["offers", ["message"]],
      ["trades", ["initiator_message", "receiver_message"]],
      ["reports", ["description", "admin_note"]],
    ] as const
  ).map(
    ([table, columns]): MaskColumnsRule => ({
      table,
      action: "mask",
      reason: "Kullanıcı yazışması: metin test için korunur, e-posta/telefon/IBAN/TCKN temizlenir.",
      columns: Object.fromEntries(columns.map((c) => [c, FREE_TEXT])),
    }),
  ),
  {
    table: "trade_disputes",
    action: "mask",
    reason: "Uyuşmazlık metni ve kanıt meta verisi.",
    columns: {
      description: FREE_TEXT,
      resolution_notes: FREE_TEXT,
      evidence: JSON_SCRUB,
    },
  },
  {
    table: "refund_requests",
    action: "mask",
    reason: "İade açıklaması ve meta veri (finalize politika görüntüsüne dokunulmaz).",
    columns: { description: FREE_TEXT, metadata: JSON_SCRUB },
  },

  // ─── Denetim ve güvenlik kayıtları ─────────────────────────────────────────
  {
    table: "audit_logs",
    action: "mask",
    reason: "Eski/yeni değer kimlik düzeltmelerini taşır; IP ve tarayıcı.",
    columns: {
      ip_address: NULL,
      user_agent: NULL,
      old_value: JSON_SCRUB,
      new_value: JSON_SCRUB,
    },
  },
  {
    table: "security_logs",
    action: "mask",
    reason: "Giriş denemelerindeki e-posta, IP, konum ve tarayıcı.",
    columns: {
      email: fake("email"),
      ip_address: NULL,
      user_agent: NULL,
      location: NULL,
      details: JSON_SCRUB,
    },
  },
  {
    table: "site_access_pins",
    action: "mask",
    reason: "PIN'in gönderildiği adres.",
    columns: { email: fake("email") },
  },
];

/**
 * Adı kişisel veri kalıbına uyan (ya da JSON olan) ama maskelenmesi GEREKMEYEN
 * kolonlar. Her satır neden güvenli olduğunu söyler; gerekçesiz satır yoktur.
 * Anahtar `tablo.kolon`.
 */
export const UAT_MASK_ALLOW_LIST: Readonly<Record<string, string>> = {
  // Bayrak / zaman damgası — değer değil, durum.
  "users.is_email_verified": "Boolean bayrak.",
  "users.is_phone_verified": "Boolean bayrak.",
  "users.accepts_marketing_emails": "Boolean tercih.",
  "elogo_invoices.email_sent_at": "Zaman damgası.",
  "seller_uploaded_invoices.email_sent_at": "Zaman damgası.",
  "seller_bank_accounts.iban_changed_at": "Zaman damgası.",
  // Personelin yazdığı toplu bildirim içeriği — kişiye özel değil.
  "scheduled_notifications.email_subject": "Kampanya e-postası konusu (personel yazar).",
  "scheduled_notifications.email_html": "Kampanya e-postası gövdesi (personel yazar).",
  // Yabancı anahtarlar — adresin kendisi addresses tablosunda maskelenir.
  "orders.shipping_address_id": "addresses.id'ye FK.",
  "trades.initiator_address_id": "addresses.id'ye FK.",
  "trades.receiver_address_id": "addresses.id'ye FK.",
  "trade_shipments.from_address_id": "addresses.id'ye FK.",
  // Kimliği ele vermeyen konum.
  "deleted_user_identities.address_city": "Yalnız il (resmî bildirim il bazında).",
  "deleted_user_identities.address_district": "Yalnız ilçe.",
  // Platformun kendi hesabı.
  "paytr_settlements.merchant_iban": "Tarodan'ın kendi PayTR mağaza IBAN'ı; kişisel değil.",
  // Kişisel veri taşımayan JSON: ayar, kural, tutar ve politika görüntüleri.
  "users.notification_settings": "Bildirim tercihleri (açık/kapalı).",
  "admin_users.permissions": "Rol izinleri.",
  "products.ai_check_labels": "Görsel moderasyon etiketleri.",
  "product_import_batches.result": "Katalog içe aktarma sonucu (ürün satırları).",
  "trades.commission_rule_snapshot": "Komisyon kuralı görüntüsü.",
  "order_packages.shipping_pricing_snapshot": "Kargo tarifesi görüntüsü.",
  "orders.discount_breakdown": "İndirim tutarları.",
  "orders.fee_discount_breakdown": "Ücret indirimi tutarları.",
  "orders.cancellation_policy_snapshot": "İptal politikası görüntüsü.",
  "refund_requests.financial_policy_snapshot": "Finalize iade politikası (tutarlar; tetikleyiciyle değişmez).",
  "moderation_events.labels": "Moderasyon etiketleri.",
  "analytics_snapshots.data": "Toplu sayılar.",
  "search_indexes.settings": "Arama dizini ayarı.",
  "mail_area_settings.events": "İç olay açık/kapalı + teslim modu.",
  "elogo_invoices.line_items": "Fatura kalemleri (ürün adı, tutar).",
};

/** Kural tanımlayan tablolar (silinen + maskelenen). */
export function catalogTables(): Set<string> {
  return new Set(UAT_MASKING_CATALOG.map((rule) => rule.table));
}

/** `tablo.kolon` → kuralı var mı (silinen tablonun her kolonu kapsanmış sayılır). */
export function isCoveredByCatalog(table: string, column: string): boolean {
  return UAT_MASKING_CATALOG.some(
    (rule) =>
      rule.table === table &&
      (rule.action === "deleteRows" || column in rule.columns),
  );
}
