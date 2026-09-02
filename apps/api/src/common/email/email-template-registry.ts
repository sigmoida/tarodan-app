export interface EmailTemplateDefinition {
  key: string;
  name: string;
  group: string;
}

export const EMAIL_TEMPLATE_DEFINITIONS = [
  { key: "welcome", name: "Hoş geldin", group: "Hesap" },
  {
    key: "email-verification",
    name: "E-posta doğrulama",
    group: "Hesap",
  },
  { key: "password-reset", name: "Şifre sıfırlama", group: "Hesap" },
  {
    key: "email-change-otp",
    name: "E-posta değişikliği doğrulama kodu",
    group: "Hesap",
  },
  {
    key: "site-access-invite",
    name: "Erken erişim daveti",
    group: "Hesap",
  },
  {
    key: "order-confirmation",
    name: "Sipariş onayı (alıcı)",
    group: "Sipariş",
  },
  {
    key: "order-created-buyer",
    name: "Sipariş oluşturuldu (alıcı)",
    group: "Sipariş",
  },
  {
    key: "order-created-seller",
    name: "Yeni sipariş (satıcı)",
    group: "Sipariş",
  },
  { key: "order-paid", name: "Ödeme alındı (alıcı)", group: "Sipariş" },
  {
    key: "order-paid-group",
    name: "Ödeme alındı - sepet (alıcı)",
    group: "Sipariş",
  },
  {
    key: "order-paid-seller",
    name: "Ödeme alındı (satıcı)",
    group: "Sipariş",
  },
  { key: "order-shipped", name: "Kargoya verildi", group: "Sipariş" },
  { key: "order-delivered", name: "Teslim edildi", group: "Sipariş" },
  {
    key: "order-cancelled-buyer",
    name: "Sipariş iptal edildi (alıcı)",
    group: "Sipariş",
  },
  {
    key: "order-cancelled-seller",
    name: "Sipariş iptal edildi (satıcı)",
    group: "Sipariş",
  },
  { key: "payment-received", name: "Ödeme alındı", group: "Ödeme" },
  { key: "payment-failed", name: "Ödeme başarısız", group: "Ödeme" },
  {
    key: "payment-refunded",
    name: "İade tamamlandı (alıcı)",
    group: "Ödeme",
  },
  {
    key: "payment-refunded-seller",
    name: "İade bildirimi (satıcı)",
    group: "Ödeme",
  },
  {
    key: "payout-released-seller",
    name: "Ödeme aktarıldı (satıcı)",
    group: "Ödeme",
  },
  {
    key: "payout-returned-seller",
    name: "Ödeme geri döndü (satıcı)",
    group: "Ödeme",
  },
  {
    key: "payout-failed-seller",
    name: "Ödeme aktarılamadı (satıcı)",
    group: "Ödeme",
  },
  {
    key: "offer-received",
    name: "Yeni teklif (satıcı)",
    group: "Teklif",
  },
  {
    key: "offer-accepted",
    name: "Teklif kabul edildi (alıcı)",
    group: "Teklif",
  },
  { key: "product-approved", name: "Ürün onaylandı", group: "Ürün" },
  {
    key: "wishlist-price-change",
    name: "Fiyat değişimi (istek listesi)",
    group: "Ürün",
  },
  { key: "back-in-stock", name: "Stoğa geri geldi", group: "Ürün" },
  {
    key: "premium-offer",
    name: "Premium üyelik teklifi",
    group: "Üyelik",
  },
  {
    key: "membership-expiring",
    name: "Üyelik bitiyor (7 gün)",
    group: "Üyelik",
  },
  {
    key: "membership-expiring-urgent",
    name: "Üyelik bitiyor (yarın)",
    group: "Üyelik",
  },
  {
    key: "marketing-newsletter",
    name: "Haftalık bülten",
    group: "Pazarlama",
  },
  {
    key: "marketing-monthly",
    name: "Aylık fırsatlar",
    group: "Pazarlama",
  },
  {
    key: "seller-application-approved",
    name: "Kurumsal başvuru onaylandı",
    group: "Kurumsal Başvuru",
  },
  {
    key: "seller-application-rejected",
    name: "Kurumsal başvuru reddedildi",
    group: "Kurumsal Başvuru",
  },
  {
    key: "seller-document-revision",
    name: "Kurumsal başvuru belge güncellemesi",
    group: "Kurumsal Başvuru",
  },
  {
    key: "seller-did-not-ship-refunded",
    name: "Satıcı kargoya vermedi (iade)",
    group: "İade",
  },
  {
    key: "refund-requested-seller",
    name: "İade talebi alındı (satıcı)",
    group: "İade",
  },
  {
    key: "refund-approved-buyer",
    name: "İade onaylandı (alıcı)",
    group: "İade",
  },
  {
    key: "refund-rejected-buyer",
    name: "İade reddedildi (alıcı)",
    group: "İade",
  },
  {
    key: "refund-return-label-buyer",
    name: "İade kargo bilgileri (alıcı)",
    group: "İade",
  },
  {
    key: "refund-completed",
    name: "İade tamamlandı (alıcı)",
    group: "İade",
  },
  {
    key: "refund-request-received-buyer",
    name: "İade talebi alındı (alıcı)",
    group: "İade",
  },
  {
    key: "refund-return-incoming-seller",
    name: "İade kargosu yola çıktı (satıcı)",
    group: "İade",
  },
  {
    key: "refund-completed-seller",
    name: "İade tamamlandı (satıcı)",
    group: "İade",
  },
  {
    key: "refund-auto-accepted-seller",
    name: "İade otomatik onaylandı (satıcı)",
    group: "İade",
  },
  {
    key: "trade-received",
    name: "Yeni takas teklifi",
    group: "Takas",
  },
  { key: "trade-accepted", name: "Takas kabul edildi", group: "Takas" },
  { key: "trade-shipped", name: "Takas kargoya verildi", group: "Takas" },
  { key: "trade-completed", name: "Takas tamamlandı", group: "Takas" },
  {
    key: "guest-checkout-otp",
    name: "Misafir sipariş doğrulama kodu",
    group: "Misafir",
  },
  {
    key: "elogo-invoice",
    name: "e-Arşiv / e-Fatura (Tarodan, PDF ekli)",
    group: "Fatura",
  },
  {
    key: "seller-invoice",
    name: "Satıcı faturası (kurumsal, PDF ekli)",
    group: "Fatura",
  },
  {
    key: "review-received-seller",
    name: "Değerlendirme alındı (satıcı)",
    group: "Değerlendirme",
  },
  { key: "listing-expiring", name: "İlan süresi doluyor", group: "İlan" },
  { key: "listing-expired", name: "İlan süresi doldu", group: "İlan" },
  { key: "new-follower", name: "Yeni takipçi", group: "Sosyal" },
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
