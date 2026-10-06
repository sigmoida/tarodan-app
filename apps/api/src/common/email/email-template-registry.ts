import { MAIL_AREAS, type MailAreaId } from "@tarodan/types";

export interface EmailTemplateDefinition {
  key: string;
  name: string;
  /** Admin şablon ekranındaki grup başlığı. */
  group: string;
  /**
   * Mail Yönlendirme alanı: şablonun hangi gönderici kutusundan çıkacağını
   * belirler (docs/MAIL_ROUTING.md). Şablon → alan eşlemesinin TEK yeri
   * burasıdır; alanı olmayan şablon tip denetiminden geçmez.
   */
  area: MailAreaId;
}

export const EMAIL_TEMPLATE_DEFINITIONS = [
  { key: "welcome", name: "Hoş geldin", group: "Hesap", area: "account" },
  {
    key: "email-verification",
    name: "E-posta doğrulama",
    group: "Hesap",
    area: "account",
  },
  {
    key: "password-reset",
    name: "Şifre sıfırlama",
    group: "Hesap",
    area: "account",
  },
  {
    key: "email-change-otp",
    name: "E-posta değişikliği doğrulama kodu",
    group: "Hesap",
    area: "account",
  },
  {
    key: "site-access-invite",
    name: "Erken erişim daveti",
    group: "Hesap",
    area: "account",
  },
  {
    key: "order-confirmation",
    name: "Sipariş onayı (alıcı)",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-created-buyer",
    name: "Sipariş oluşturuldu (alıcı)",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-created-seller",
    name: "Yeni sipariş (satıcı)",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-paid",
    name: "Ödeme alındı (alıcı)",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-paid-group",
    name: "Ödeme alındı - sepet (alıcı)",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-paid-seller",
    name: "Ödeme alındı (satıcı)",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-shipped",
    name: "Kargoya verildi",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-delivered",
    name: "Teslim edildi",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "order-cancelled-buyer",
    name: "Sipariş iptal edildi (alıcı)",
    group: "İptal",
    area: "cancellation",
  },
  {
    key: "order-cancelled-seller",
    name: "Sipariş iptal edildi (satıcı)",
    group: "İptal",
    area: "cancellation",
  },
  {
    key: "order-cancelled-by-platform-buyer",
    name: "Sipariş Tarodan tarafından iptal edildi (alıcı)",
    group: "İptal",
    area: "cancellation",
  },
  {
    key: "order-cancelled-by-platform-seller",
    name: "Sipariş Tarodan tarafından iptal edildi (satıcı)",
    group: "İptal",
    area: "cancellation",
  },
  {
    key: "payment-received",
    name: "Ödeme alındı",
    group: "Ödeme",
    area: "payment",
  },
  {
    key: "payment-failed",
    name: "Ödeme başarısız",
    group: "Ödeme",
    area: "payment",
  },
  {
    key: "payment-refunded",
    name: "İade tamamlandı (alıcı)",
    group: "Ödeme",
    area: "refund",
  },
  {
    key: "payment-refunded-seller",
    name: "İade bildirimi (satıcı)",
    group: "Ödeme",
    area: "refund",
  },
  {
    key: "payout-released-seller",
    name: "Ödeme aktarıldı (satıcı)",
    group: "Ödeme",
    area: "payment",
  },
  {
    key: "payout-returned-seller",
    name: "Ödeme geri döndü (satıcı)",
    group: "Ödeme",
    area: "payment",
  },
  {
    key: "payout-failed-seller",
    name: "Ödeme aktarılamadı (satıcı)",
    group: "Ödeme",
    area: "payment",
  },
  {
    key: "offer-received",
    name: "Yeni teklif (satıcı)",
    group: "Teklif",
    area: "offer",
  },
  {
    key: "offer-accepted",
    name: "Teklif kabul edildi (alıcı)",
    group: "Teklif",
    area: "offer",
  },
  {
    key: "product-approved",
    name: "Ürün onaylandı",
    group: "Ürün",
    area: "listing",
  },
  {
    key: "wishlist-price-change",
    name: "Fiyat değişimi (istek listesi)",
    group: "Ürün",
    area: "listing",
  },
  {
    key: "back-in-stock",
    name: "Stoğa geri geldi",
    group: "Ürün",
    area: "listing",
  },
  {
    key: "premium-offer",
    name: "Premium üyelik teklifi",
    group: "Üyelik",
    area: "membership",
  },
  {
    key: "membership-expiring",
    name: "Üyelik bitiyor (7 gün)",
    group: "Üyelik",
    area: "membership",
  },
  {
    key: "membership-expiring-urgent",
    name: "Üyelik bitiyor (yarın)",
    group: "Üyelik",
    area: "membership",
  },
  {
    key: "marketing-newsletter",
    name: "Haftalık bülten",
    group: "Pazarlama",
    area: "marketing",
  },
  {
    key: "marketing-monthly",
    name: "Aylık fırsatlar",
    group: "Pazarlama",
    area: "marketing",
  },
  {
    key: "report-resolved",
    name: "Şikayet sonuçlandı (şikayet eden)",
    group: "Şikayet",
    area: "report",
  },
  {
    key: "seller-application-approved",
    name: "Kurumsal başvuru onaylandı",
    group: "Kurumsal Başvuru",
    area: "sellerApplication",
  },
  {
    key: "seller-application-rejected",
    name: "Kurumsal başvuru reddedildi",
    group: "Kurumsal Başvuru",
    area: "sellerApplication",
  },
  {
    key: "seller-document-revision",
    name: "Kurumsal başvuru belge güncellemesi",
    group: "Kurumsal Başvuru",
    area: "sellerApplication",
  },
  {
    key: "seller-did-not-ship-refunded",
    name: "Satıcı kargoya vermedi (iade)",
    group: "İade",
    area: "refund",
  },
  {
    key: "order-preparing-extended-buyer",
    name: "Kargo süresi uzatıldı (alıcı)",
    group: "Sipariş",
    area: "order",
  },
  {
    key: "refund-requested-seller",
    name: "İade talebi alındı (satıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-approved-buyer",
    name: "İade onaylandı (alıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-rejected-buyer",
    name: "İade reddedildi (alıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-return-label-buyer",
    name: "İade kargo bilgileri (alıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-completed",
    name: "İade tamamlandı (alıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-request-received-buyer",
    name: "İade talebi alındı (alıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-return-incoming-seller",
    name: "İade kargosu yola çıktı (satıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-completed-seller",
    name: "İade tamamlandı (satıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "refund-auto-accepted-seller",
    name: "İade otomatik onaylandı (satıcı)",
    group: "İade",
    area: "refund",
  },
  {
    key: "trade-received",
    name: "Yeni takas teklifi",
    group: "Takas",
    area: "trade",
  },
  {
    key: "trade-accepted",
    name: "Takas kabul edildi",
    group: "Takas",
    area: "trade",
  },
  {
    key: "trade-shipped",
    name: "Takas kargoya verildi",
    group: "Takas",
    area: "trade",
  },
  {
    key: "trade-completed",
    name: "Takas tamamlandı",
    group: "Takas",
    area: "trade",
  },
  {
    key: "trade-cancelled-platform",
    name: "Takas Tarodan tarafından iptal edildi",
    group: "Takas",
    area: "trade",
  },
  {
    key: "guest-checkout-otp",
    name: "Misafir sipariş doğrulama kodu",
    group: "Misafir",
    area: "order",
  },
  {
    key: "elogo-invoice",
    name: "e-Arşiv / e-Fatura (Tarodan, PDF ekli)",
    group: "Fatura",
    area: "invoice",
  },
  {
    key: "seller-invoice",
    name: "Satıcı faturası (kurumsal, PDF ekli)",
    group: "Fatura",
    area: "invoice",
  },
  {
    key: "review-received-seller",
    name: "Değerlendirme alındı (satıcı)",
    group: "Değerlendirme",
    area: "social",
  },
  {
    key: "listing-expiring",
    name: "İlan süresi doluyor",
    group: "İlan",
    area: "listing",
  },
  {
    key: "listing-expired",
    name: "İlan süresi doldu",
    group: "İlan",
    area: "listing",
  },
  {
    key: "new-follower",
    name: "Yeni takipçi",
    group: "Sosyal",
    area: "social",
  },
] as const satisfies readonly EmailTemplateDefinition[];

export type EmailTemplateKey =
  (typeof EMAIL_TEMPLATE_DEFINITIONS)[number]["key"];

export const EMAIL_TEMPLATE_DEFINITION_BY_KEY = new Map<
  string,
  EmailTemplateDefinition
>(EMAIL_TEMPLATE_DEFINITIONS.map((definition) => [definition.key, definition]));

export function isEmailTemplateKey(key: string): key is EmailTemplateKey {
  return EMAIL_TEMPLATE_DEFINITION_BY_KEY.has(key);
}

/** Şablonun Mail Yönlendirme alanı; kayıtta olmayan anahtar için undefined. */
export function mailAreaOfTemplate(key: string): MailAreaId | undefined {
  return EMAIL_TEMPLATE_DEFINITION_BY_KEY.get(key)?.area;
}

/** Alan → o alana ait şablon anahtarları (kayıt sırasıyla, admin ekranı için). */
export function templateKeysByMailArea(): Record<MailAreaId, string[]> {
  const byArea = Object.fromEntries(
    MAIL_AREAS.map((area) => [area, [] as string[]]),
  ) as Record<MailAreaId, string[]>;
  for (const definition of EMAIL_TEMPLATE_DEFINITIONS) {
    byArea[definition.area].push(definition.key);
  }
  return byArea;
}
