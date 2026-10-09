import { SYSTEM_GUEST_EMAIL } from "../../../modules/elogo/invoice/elogo-guest-recipient";
import {
  ANONYMIZED_DISPLAY_NAME,
  ANONYMIZED_EMAIL_PATTERN,
} from "../deleted-user-identity";
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
 * Gerçek sistem hesapları maskelenmez: kod onları e-postayla bulur (platform
 * satıcısı, misafir siparişlerinin ortak kullanıcısı). Liste dar tutulur:
 * gerçek bir kişi buraya giremez.
 */
export const UAT_MASK_KEPT_SYSTEM_EMAILS: readonly string[] = [
  PLATFORM_EMAIL,
  SYSTEM_GUEST_EMAIL,
];

/** Gerçek sistem hesabı satırı (platform, misafir) — hiçbir kolonu maskelenmez. */
export const USERS_SYSTEM_ACCOUNT_SQL = `"email" IN (${UAT_MASK_KEPT_SYSTEM_EMAILS.map(sqlLiteral).join(", ")})`;

/**
 * Silinmiş hesabın anonim sentinel'i: `deleted_<id>@deleted.local` e-postası VE
 * "Silinmiş Kullanıcı" adı (`deleteAccount` ikisini birlikte yazar). İkisi de
 * kişisel değildir ve kod onlara bakar (`isAnonymizedEmail`, arşiv
 * çözümleyicisi; ekranlar silinmiş kişiyi bu adla gösterir), bu yüzden YALNIZ bu
 * iki kolon korunur. `deleteAccount` kullanıcı adını ve doğum tarihini
 * temizlemez: silinmiş hesabın diğer her kişisel kolonu canlı hesap gibi
 * maskelenir. Sentinel'i tam taşımayan (eski) silinmiş satırın e-postası ve adı
 * da maskelenir.
 */
export const USERS_ANONYMIZED_SENTINEL_SQL =
  `("email" ~* ${sqlLiteral(ANONYMIZED_EMAIL_PATTERN.source)}` +
  ` AND "display_name" = ${sqlLiteral(ANONYMIZED_DISPLAY_NAME)})`;

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
  deleteRows(
    "oauth_accounts",
    "Gerçek Google/Apple kimliklerine bağ; staging'de gerçek kişi sosyal girişle hesaba düşmesin.",
  ),
  deleteRows("two_factor_secrets", "2FA sırları."),
  deleteRows(
    "password_reset_tokens",
    "Tek kullanımlık sıfırlama bağlantıları.",
  ),
  deleteRows(
    "email_verification_tokens",
    "Doğrulama bağlantıları + gerçek adres.",
  ),
  deleteRows("phone_verification_tokens", "Doğrulama kodu + gerçek telefon."),
  deleteRows(
    "email_change_tokens",
    "Bekleyen e-posta değişikliği + gerçek yeni adres.",
  ),
  deleteRows("refresh_tokens", "Canlı oturumlar (+ IP)."),
  deleteRows("admin_sessions", "Canlı personel oturumları (+ IP)."),
  deleteRows("csrf_tokens", "Oturuma bağlı CSRF token'ları."),
  deleteRows(
    "push_tokens",
    "Gerçek cihazların push token'ı: staging bir bildirimi müşterinin telefonuna göndermesin.",
  ),
  deleteRows(
    "saved_cards",
    "Canlı PayTR mağazasının kart token'ları (utoken/ctoken) + onay IP'si.",
  ),

  // ─── Yan etki kuyrukları ve loglar: silinir ────────────────────────────────
  deleteRows(
    "outbox_events",
    "Canlıda bekleyen yan etkiler staging'de yeniden oynatılmaz.",
  ),
  deleteRows(
    "mail_internal_notices",
    "Personel iç bildirimleri (gönderilmemiş olanlar staging alıcılarına gitmesin).",
  ),
  deleteRows("email_logs", "Gönderim geçmişi: alıcı adresleri gerçek."),
  deleteRows(
    "notification_logs",
    "Bildirim geçmişi: metinler karşı tarafın adını taşır.",
  ),
  deleteRows(
    "error_logs",
    "Hata ayrıntıları istek gövdesinden kişisel veri taşıyabilir.",
  ),
  deleteRows("cache_entries", "Canlıdan kalma önbellek."),
  deleteRows(
    "site_access_pins",
    "Production'ın kilitli sitesine giriş kodları (sır) + davetlinin adresi/adı; staging'in kendi PIN'lerini workflow taşır.",
  ),
  deleteRows(
    "uat_refresh_runs",
    "Production'da yenileme koşusu olmaz; staging'in kendi geçmişini workflow taşır.",
  ),

  // ─── Mail Yönlendirme: canlı kutular silinir (staging'inkini workflow taşır)
  {
    table: "mail_area_settings",
    action: "mask",
    reason:
      "Silinecek gönderici kutularına bağ (RESTRICT) ve iç alıcı adresleri.",
    columns: {
      sender_account_id: NULL,
      reply_to: NULL,
      internal_recipients: { strategy: "constant", sql: "'[]'::jsonb" },
    },
  },
  deleteRows(
    "mail_sender_accounts",
    "Canlı posta kutularının şifrelenmiş şifreleri.",
  ),

  // ─── Kişiler ───────────────────────────────────────────────────────────────
  {
    table: "users",
    action: "mask",
    reason:
      "Kimlik ve şirket bilgisi + kullanıcının yazdığı metin; yalnız gerçek sistem hesapları korunur (silinmiş hesaplar DAHİL maskelenir).",
    keepWhere: `(${USERS_SYSTEM_ACCOUNT_SQL})`,
    columns: {
      phone: fake("phone", { unique: true }),
      username: fake("username", { unique: true }),
      legal_first_name: fake("firstName"),
      legal_last_name: fake("lastName"),
      national_id: fake("tckn", { unique: true }),
      birth_date: fake("birthDate"),
      tax_id: fake("taxId"),
      company_name: fake("companyName", { unique: true }),
      bio: FREE_TEXT,
      banned_reason: FREE_TEXT,
    },
  },
  {
    table: "users",
    action: "mask",
    reason:
      "E-posta ve görünen ad; sistem hesapları ve silinmiş hesabın anonim sentinel'i (kişisel değil, kod ona bakar) korunur.",
    keepWhere: `(${USERS_SYSTEM_ACCOUNT_SQL} OR ${USERS_ANONYMIZED_SENTINEL_SQL})`,
    columns: {
      email: fake("email", { unique: true }),
      display_name: fake("fullName"),
    },
  },
  {
    table: "users",
    action: "mask",
    reason:
      "Şifre ve cihaz token'ı HER satırda (sistem hesapları dahil) silinir.",
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
    reason:
      "Silinen hesapların yasal kimlik arşivi (tetikleyicisi maskeleme süresince kapalı).",
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
    reason:
      "Misafir e-postası, IP ve tarayıcı (tetikleyicisi maskeleme süresince kapalı).",
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
    reason:
      "Alıcı adı (kullanıcının sahte adıyla aynı), telefon ve açık adres. İl/ilçe kalır: kargo tarifesi onlara bakıyor.",
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
    reason:
      "Satıcı banka hesabı; kullanıcı id'siyle anahtarlanır ki hesap sahibi kullanıcının sahte yasal adıyla eşleşsin.",
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
    reason:
      "Yüklenen belge adı (kişi adı içerebilir) ve inceleme notları. Dosyanın kendisi production önekinde; staging onu okuyamaz.",
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
    reason:
      "Ödeme yapılan IBAN ve ad; satıcı id'siyle anahtarlanır (banka hesabıyla tutarlı).",
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
  ).map(([table, column]): MaskColumnsRule => ({
    table,
    action: "mask",
    reason: "Sağlayıcı yanıtı / meta veri: ad, adres, e-posta, IP gömebilir.",
    columns: { [column]: JSON_SCRUB },
  })),
  {
    table: "orders",
    action: "mask",
    reason:
      "Teslimat/fatura adresi anlık görüntüsü (misafirin adı, e-postası, telefonu) ve finans görüntüsündeki adlar.",
    columns: {
      shipping_address: JSON_SCRUB,
      financial_snapshot: JSON_SCRUB,
      cancel_reason: FREE_TEXT,
    },
  },
  {
    table: "elogo_invoices",
    action: "mask",
    reason:
      "Fatura alıcısının kimliği ve adresi. Fatura numarası/ETTN aynen kalır.",
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
    reason:
      "Etiket (alıcının adı/adresi/telefonu basılı) ve teslim alan kişinin adı.",
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
  ).map(([table, columns]): MaskColumnsRule => ({
    table,
    action: "mask",
    reason:
      "Kullanıcı yazışması: metin test için korunur, e-posta/telefon/IBAN/TCKN temizlenir.",
    columns: Object.fromEntries(columns.map((c) => [c, FREE_TEXT])),
  })),
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
    reason:
      "İade açıklaması ve meta veri (finalize politika görüntüsüne dokunulmaz).",
    columns: { description: FREE_TEXT, metadata: JSON_SCRUB },
  },

  // ─── Kullanıcının/personelin yazdığı diğer metinler ve dosya adları ────────
  ...(
    [
      ["reports", ["reason"]],
      ["trades", ["cancel_reason"]],
      ["offers", ["cancel_reason"]],
      ["trade_disputes", ["reason", "resolution"]],
      ["trade_shipments", ["lost_reason"]],
      ["user_blocks", ["reason"]],
      ["ratings", ["comment"]],
      ["product_ratings", ["title", "review", "admin_reply"]],
      ["collections", ["name", "description"]],
      ["collection_items", ["custom_title", "custom_description"]],
      ["addresses", ["title"]],
      ["messages", ["flagged_reason"]],
      ["moderation_events", ["reason"]],
      ["product_removal_events", ["detail"]],
      ["commission_ledger", ["waived_reason"]],
      ["discount_usages", ["revoke_reason"]],
      ["paytr_statement_lines", ["resolution_note"]],
      ["invoices", ["cancel_reason"]],
      ["elogo_invoices", ["cancel_reason"]],
      ["shipments", ["return_reason"]],
      ["refund_requests", ["seller_response"]],
      ["carrier_cancellation_tasks", ["reason", "resolution"]],
      ["ledger_entries", ["memo"]],
      // Taşıyıcı olay metni teslim alanın adını taşıyabilir; ad yakalanamaz,
      // iletişim verisi temizlenir (bkz. docs/UAT_REFRESH.md sınırlar).
      ["shipment_events", ["description"]],
      ["trade_shipment_events", ["description"]],
    ] as const
  ).map(([table, columns]): MaskColumnsRule => ({
    table,
    action: "mask",
    reason:
      "Elle yazılan metin (gerekçe, not, yorum, başlık): metin kalır, e-posta/telefon/IBAN/TCKN temizlenir.",
    columns: Object.fromEntries(columns.map((c) => [c, FREE_TEXT])),
  })),
  {
    table: "products",
    action: "mask",
    reason:
      "İlan metni satıcı yazar (iletişim bilgisi sızabilir); arama metni tetikleyicisi maskeleme süresince kapalı olduğundan o da aynı kuraldan geçer.",
    columns: {
      title: FREE_TEXT,
      description: FREE_TEXT,
      search_text: FREE_TEXT,
      rejection_reason: FREE_TEXT,
      ai_check_reason: FREE_TEXT,
    },
  },
  {
    table: "paytr_statement_lines",
    action: "mask",
    reason:
      "Maskeli kart numarası (ilk 6 + son 4) — staging'de gereksiz kart verisi.",
    columns: { masked_pan: NULL },
  },
  {
    table: "refund_requests",
    action: "mask",
    reason: "İade kargo etiketi (gönderenin adı/adresi/telefonu basılı).",
    columns: { return_label_zpl: NULL },
  },
  ...(
    [
      ["seller_uploaded_invoices", "file_name"],
      ["media_files", "filename"],
      ["product_import_batches", "source_filename"],
    ] as const
  ).map(([table, column]): MaskColumnsRule => ({
    table,
    action: "mask",
    reason: "Yüklenen dosyanın özgün adı kişi adı taşıyabilir; uzantı kalır.",
    columns: { [column]: fake("fileName") },
  })),
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
];

/**
 * Maskelenmeyen metin/JSON kolonları — gerekçeli İZİN LİSTESİ.
 *
 * Sözleşme (`masking-catalog.contract.spec.ts`): şemadaki HER `String`,
 * `String[]` ve `Json` kolonu ya katalogda bir kurala ya da buradaki bir gruba
 * girer; yalnız birincil anahtarlar ve bir `@relation`'ın `fields`'ı olan yabancı
 * anahtarlar yapısal olarak muaftır (rastgele UUID, veri değil). Kişisel veri
 * adı taşıyan (ör. `isEmailVerified`) diğer tipteki kolonlar da burada durur.
 * Yeni bir metin kolonu eklendiğinde ya kural yazılır ya da buraya gerekçesiyle
 * girer — sessizce staging'e taşınamaz.
 */
export interface AllowListGroup {
  reason: string;
  /** `tablo.kolon` (SQL adları). */
  columns: readonly string[];
}

export const UAT_MASK_ALLOW_GROUPS: readonly AllowListGroup[] = [
  {
    reason: "Değer değil durum: boolean bayrak ya da zaman damgası.",
    columns: [
      "users.is_email_verified",
      "users.is_phone_verified",
      "users.accepts_marketing_emails",
      "elogo_invoices.email_sent_at",
      "seller_uploaded_invoices.email_sent_at",
      "seller_bank_accounts.iban_changed_at",
    ],
  },
  {
    reason:
      "Opak kimlik ya da ilişkisiz (polimorfik) bağ: rastgele UUID / personel id'si / iş kodu, kişisel veri değil.",
    columns: [
      "users.admin_code",
      "users.banned_by",
      "deleted_user_identities.admin_code",
      "deleted_user_identities.deleted_by_admin_user_id",
      "consent_records.visitor_id",
      "corporate_application_events.actor_admin_id",
      "corporate_application_events.actor_user_id",
      "reports.target_id",
      "reports.resolved_by",
      "featured_snapshots.entity_id",
      "admin_users.created_by",
      "product_removal_events.actor_user_id",
      "product_import_batches.admin_id",
      "product_import_batches.seller_id",
      "product_boosts.order_id",
      "trades.cash_payer_id",
      "trades.compensation_pending_user_id",
      "trade_shipments.shipper_id",
      "trade_shipments.recipient_user_id",
      "trade_cash_payments.payer_id",
      "trade_cash_payments.recipient_id",
      "trade_cash_payments.trade_fee_campaign_id",
      "trade_disputes.raised_by_id",
      "trade_disputes.resolved_by_id",
      "trade_messages.sender_id",
      "message_threads.participant1_id",
      "message_threads.participant2_id",
      "message_threads.product_id",
      "messages.product_id",
      "messages.reviewed_by_id",
      "ratings.order_id",
      "ratings.trade_id",
      "product_ratings.order_id",
      "support_tickets.order_id",
      "support_tickets.trade_id",
      "order_packages.seller_id",
      "order_packages.buyer_id",
      "order_packages.shipping_tariff_id",
      "payment_holds.order_id",
      "payment_holds.frozen_by_refund_id",
      "seller_documents.reviewed_by",
      "seller_documents.supersedes_id",
      "paytr_statement_lines.payment_id",
      "paytr_statement_lines.refund_attempt_id",
      "paytr_statement_lines.membership_payment_id",
      "paytr_statement_lines.resolved_by_id",
      "paytr_settlement_items.payment_id",
      "payment_provider_events.payment_id",
      "payment_provider_events.membership_payment_id",
      "seller_account_adjustments.seller_id",
      "seller_account_adjustments.order_id",
      "seller_account_adjustments.refund_request_id",
      "elogo_invoices.source_id",
      "elogo_invoices.recipient_user_id",
      "seller_uploaded_invoices.seller_id",
      "seller_uploaded_invoices.buyer_id",
      "shipping_tariffs.created_by",
      "shipping_tariffs.updated_by",
      "refund_requests.policy_finalized_by",
      "refund_requests.decided_by",
      "commission_rule_sets.published_by",
      "platform_settings.updated_by",
      "audit_logs.entity_id",
      "moderation_events.entity_id",
      "moderation_events.user_id",
      "media_files.uploader_id",
      "media_files.entity_id",
      "security_logs.user_id",
      "security_logs.resolved_by",
      "mail_area_settings.updated_by",
      "discount_codes.redeemed_by_id",
      "discount_codes.order_id",
      "discount_usages.order_id",
      "discounts.targetProductIds",
      "scheduled_notifications.created_by",
      "carrier_cancellation_tasks.entity_id",
      "carrier_cancellation_tasks.resolved_by",
      "ledger_entries.entry_group_id",
      "ledger_entries.payment_id",
      "ledger_entries.order_id",
      "ledger_entries.trade_id",
      "ledger_entries.payout_id",
      "ledger_entries.hold_id",
      "ledger_entries.seller_id",
      "ledger_entries.buyer_id",
      "orders.shipping_address_id",
      "trades.initiator_address_id",
      "trades.receiver_address_id",
      "trade_shipments.from_address_id",
    ],
  },
  {
    reason:
      "İş numarası ya da sağlayıcı/taşıyıcı referansı ve sonuç kodu — sahip kararıyla production'daki gibi kalır.",
    columns: [
      "user_memberships.scheduled_billing_period",
      "membership_payments.billing_period",
      "membership_payments.idempotency_key",
      "membership_payments.provider",
      "membership_payments.provider_payment_id",
      "membership_payments.merchant_oid",
      "membership_payments.payment_type",
      "trades.trade_number",
      "trades.pricing_version",
      "trades.admin_cancel_reason_code",
      "trades.refund_failure_reason",
      "trade_shipments.carrier",
      "trade_shipments.tracking_number",
      "trade_shipments.provider_tracking_id",
      "trade_shipments.leg",
      "trade_shipments.recipient_type",
      "trade_shipment_events.status",
      "trade_shipment_events.location",
      "trade_cash_payments.provider",
      "trade_cash_payments.provider_payment_id",
      "support_tickets.ticket_number",
      "checkout_groups.group_number",
      "checkout_groups.idempotency_key",
      "checkout_groups.distance_sales_version",
      "order_packages.package_number",
      "order_packages.carrier_reference",
      "orders.order_number",
      "orders.discount_code",
      "orders.admin_cancel_reason_code",
      "payments.provider",
      "payments.provider_payment_id",
      "payments.provider_conversation_id",
      "payments.currency",
      "payments.failure_reason",
      "refund_attempts.idempotency_key",
      "refund_attempts.provider",
      "refund_attempts.provider_reference",
      "refund_attempts.provider_refund_id",
      "refund_attempts.failure_reason",
      "paytr_statement_lines.merchant_oid",
      "paytr_statement_lines.currency",
      "paytr_statement_lines.card_brand",
      "paytr_statement_lines.payment_type",
      "paytr_settlements.currency",
      "paytr_settlement_items.merchant_oid",
      "paytr_settlement_items.currency",
      "payment_provider_events.provider",
      "payment_provider_events.merchant_oid",
      "payment_provider_events.status",
      "payment_provider_events.payment_type",
      "payment_provider_events.currency",
      "payment_provider_events.failed_reason_code",
      "payment_provider_events.failed_reason_msg",
      "payout_transfers.currency",
      "payout_transfers.merchant_oid",
      "payout_transfers.trans_id",
      "payout_transfers.provider_reference",
      "payout_transfers.failure_reason",
      "seller_account_adjustments.source_key",
      "invoices.invoice_number",
      "invoices.status",
      "elogo_invoices.source_reference",
      "elogo_invoices.document_type",
      "elogo_invoices.send_type",
      "elogo_invoices.invoice_number",
      "elogo_invoices.ettn",
      "elogo_invoices.elogo_ref_id",
      "elogo_invoices.elogo_result_msg",
      "elogo_invoices.billing_reference",
      "elogo_invoices.line_description",
      "elogo_doc_sequences.prefix",
      "document_sequences.scope",
      "shipments.provider",
      "shipments.tracking_number",
      "shipments.tracking_url",
      "shipments.provider_tracking_id",
      "shipments.provider_raw_status",
      "shipment_events.status",
      "shipment_events.location",
      "refund_requests.refund_number",
      "refund_requests.return_provider",
      "refund_requests.return_tracking_number",
      "refund_requests.return_provider_tracking_id",
      "refund_requests.provider_refund_id",
      "refund_requests.policy_code",
      "package_shipping_settlements.source_key",
      "product_boosts.package_name",
      "ledger_entries.currency",
      "ledger_entries.idempotency_key",
      "carrier_cancellation_tasks.dedupe_key",
      "carrier_cancellation_tasks.provider",
      "carrier_cancellation_tasks.reference",
      "carrier_cancellation_tasks.entity_type",
      "discount_codes.code",
      "discounts.code",
      "carts.coupon_code",
    ],
  },
  {
    reason: "Durum / tür / kod alanı (enum benzeri, sabit küme).",
    columns: [
      "users.preferred_language",
      "consent_records.document",
      "consent_records.version",
      "corporate_application_events.action",
      "reports.type",
      "reports.status",
      "trade_items.side",
      "product_removal_events.platform",
      "product_removal_events.violation_code",
      "products.ai_check_status",
      "audit_logs.action",
      "audit_logs.entity_type",
      "moderation_events.entity_type",
      "moderation_events.kind",
      "moderation_events.field",
      "moderation_events.decision",
      "security_logs.event_type",
      "security_logs.severity",
      "analytics_snapshots.snapshot_type",
      "search_indexes.index_name",
      "search_indexes.status",
      "scheduled_notifications.channels",
      "scheduled_notifications.target_type",
      "scheduled_notifications.mailing_type",
      "scheduled_notifications.status",
      "media_files.bucket",
      "media_files.mime_type",
      "media_files.entity_type",
      "seller_documents.mime_type",
      "content_filters.filter_type",
      "platform_settings.setting_type",
      "email_templates.key",
    ],
  },
  {
    reason:
      "Katalog, ilan kodu ya da platform içeriği: herkese açık ya da personelin yazdığı, kişiye özel değil.",
    columns: [
      "membership_tiers.name",
      "membership_tiers.description",
      "categories.name",
      "categories.slug",
      "categories.description",
      "brands.name",
      "brands.slug",
      "brands.logo",
      "brands.description",
      "brands.website",
      "brands.country",
      "car_models.name",
      "car_models.slug",
      "car_models.image",
      "car_models.description",
      "manufacturers.name",
      "manufacturers.slug",
      "manufacturers.logo",
      "manufacturers.description",
      "manufacturers.website",
      "manufacturers.country",
      "products.product_code",
      "products.slug",
      "products.edition_number",
      "products.model_code",
      "products.color",
      "products.approved_content_fingerprint",
      "ad_packages.name",
      "ad_packages.slug",
      "attribute_groups.name",
      "attribute_groups.slug",
      "attribute_groups.description",
      "attribute_groups.manufacturer_slug",
      "attributes.value",
      "attributes.slug",
      "attributes.display_value",
      "attributes.color",
      "collections.slug",
      "collection_items.custom_brand",
      "collection_items.custom_model",
      "collection_items.custom_scale",
      "collection_items.custom_manufacturer",
      "collection_items.custom_material",
      "content_filters.name",
      "content_filters.pattern",
      "content_filters.replacement",
      "shipping_tariffs.provider",
      "shipping_tariffs.name",
      "shipping_tariffs.currency",
      "shipping_package_tiers.label",
      "commission_rule_sets.name",
      "commission_rules.name",
      "tax_regions.name",
      "tax_regions.country_code",
      "tax_regions.region_code",
      "tax_rates.name",
      "static_pages.slug",
      "static_pages.title",
      "static_pages.content",
      "static_pages.meta_title",
      "static_pages.meta_description",
      "static_pages.meta_keywords",
      "email_templates.name",
      "email_templates.subject",
      "email_templates.body_html",
      "email_templates.variables_json",
      "platform_settings.setting_key",
      "platform_settings.setting_value",
      "platform_settings.description",
      "advertisements.title",
      "advertisements.image_url",
      "advertisements.link_url",
      "advertisements.content",
      "advertisements.alt_text",
      "discounts.name",
      "discounts.description",
      "scheduled_notifications.title",
      "scheduled_notifications.body",
      "scheduled_notifications.email_subject",
      "scheduled_notifications.email_html",
      "mail_area_settings.display_name",
      "product_import_batches.request_fingerprint",
      "product_import_batches.error_messages",
    ],
  },
  {
    reason:
      "Görsel/belge anahtarı ya da URL: herkese açık görseller salt okunur (sahip kararı); özel anahtarlar staging'in S3 öneki dışında olduğundan staging'den okunamaz.",
    columns: [
      "users.avatar_url",
      "product_images.card_key",
      "product_images.detail_key",
      "product_ratings.images",
      "collections.cover_image_key",
      "collection_items.custom_image_url",
      "seller_documents.s3_key",
      "invoices.pdf_url",
      "elogo_invoices.pdf_url",
      "seller_uploaded_invoices.pdf_key",
      "media_files.key",
      "media_files.url",
      "refund_requests.evidence_photo_urls",
      "ticket_messages.attachments",
    ],
  },
  {
    reason:
      "Tek başına kimliği ele vermeyen konum / vergi dairesi / şirket türü (kargo tarifesi ve resmî bildirim il bazında).",
    columns: [
      "users.company_type",
      "users.tax_office",
      "users.company_city",
      "users.company_district",
      "deleted_user_identities.tax_office",
      "deleted_user_identities.company_type",
      "deleted_user_identities.address_city",
      "deleted_user_identities.address_district",
      "corporate_applications.company_type",
      "corporate_applications.tax_office",
      "corporate_applications.company_city",
      "corporate_applications.company_district",
      "addresses.city",
      "addresses.district",
      "elogo_invoices.recipient_city",
      "elogo_invoices.recipient_district",
    ],
  },
  {
    reason: "Tarodan'ın kendi PayTR mağaza IBAN'ı; kişisel değil.",
    columns: ["paytr_settlements.merchant_iban"],
  },
  {
    reason:
      "Kişisel veri taşımayan JSON: ayar, kural, tarife, tutar ve politika görüntüleri, etiketler, toplu sayılar.",
    columns: [
      "users.notification_settings",
      "admin_users.permissions",
      "products.ai_check_labels",
      "product_import_batches.result",
      "trades.commission_rule_snapshot",
      "order_packages.shipping_pricing_snapshot",
      "orders.discount_breakdown",
      "orders.fee_discount_breakdown",
      "orders.cancellation_policy_snapshot",
      "refund_requests.financial_policy_snapshot",
      "moderation_events.labels",
      "analytics_snapshots.data",
      "search_indexes.settings",
      "mail_area_settings.events",
      "elogo_invoices.line_items",
    ],
  },
];

/** `tablo.kolon` → gerekçe (grupların düz hali; aynı kolon iki grupta olamaz). */
export const UAT_MASK_ALLOW_LIST: Readonly<Record<string, string>> =
  Object.fromEntries(
    UAT_MASK_ALLOW_GROUPS.flatMap((group) =>
      group.columns.map((column) => [column, group.reason]),
    ),
  );

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
