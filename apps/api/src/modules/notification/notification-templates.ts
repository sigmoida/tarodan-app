/**
 * Notification templates (Turkish)
 * Extracted from NotificationService (behavior-preserving split).
 */
import { NotificationType } from './dto';

// Notification templates (Turkish)
export const NOTIFICATION_TEMPLATES: Record<NotificationType, { title: string; message: string; icon?: string; link?: string }> = {
  // Order notifications
  [NotificationType.ORDER_CREATED]: {
    title: 'Siparişiniz Oluşturuldu',
    message: 'Siparişiniz başarıyla oluşturuldu. Ödeme bekleniyor.',
    icon: '📦',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_PAID]: {
    title: 'Ödeme Alındı',
    message: 'Siparişiniz için ödeme alındı. Satıcı siparişinizi hazırlıyor.',
    icon: '💳',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_SHIPPED]: {
    title: 'Siparişiniz Kargoya Verildi',
    message: 'Siparişiniz kargoya verildi. Takip numaranız: {{trackingNumber}}',
    icon: '🚚',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_DELIVERED]: {
    title: 'Siparişiniz Teslim Edildi',
    message: 'Siparişiniz teslim edildi; teslim tarihinden itibaren 14 gün içinde koşulsuz iade hakkınız var.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_COMPLETED]: {
    title: 'Sipariş Tamamlandı',
    message: 'Siparişiniz başarıyla tamamlandı. Teşekkür ederiz!',
    icon: '🎉',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_CANCELLED]: {
    title: 'Sipariş İptal Edildi',
    message: 'Siparişiniz iptal edildi. Ödediğiniz tutar iade edilecek.',
    icon: '❌',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_CANCELLED_SELLER]: {
    title: 'Satış İptal Edildi',
    message: '{{orderNumber}} numaralı siparişiniz iptal edildi.',
    icon: '❌',
    link: '/sales/{{orderId}}',
  },
  [NotificationType.ORDER_CANCELLED_OUT_OF_STOCK]: {
    title: 'Siparişiniz iptal edildi: stok tükendi',
    message: '{{productTitle}} adlı ürün başka bir alıcı tarafından satın alındı. Benzer ürünlere göz atabilirsiniz.',
    icon: '❌',
    link: '/products/unavailable/{{productId}}',
  },
  [NotificationType.ORDER_REFUNDED]: {
    title: 'İade İşlemi Tamamlandı',
    message: 'Ödemeniz iade edildi. {{amount}} TL hesabınıza aktarılacak.',
    icon: '💰',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_PREPARING_DEADLINE_WARNING]: {
    title: 'Kargo Süresi Dolmak Üzere',
    message: '"{{productTitle}}" siparişini {{deadline}} tarihine kadar kargoya vermeniz gerekmektedir. Aksi halde sipariş otomatik iptal edilecektir.',
    icon: '⚠️',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_RESERVATION_RELEASED]: {
    title: 'Stok rezervasyonunuz kaldırıldı',
    message: '{{productTitle}} için 30 dakika içinde ödeme tamamlanmadığı için stok rezervasyonu kaldırıldı. Ürün stoktaysa 24 saat içinde tekrar ödeme yapabilirsiniz.',
    icon: '⏳',
    link: '/orders/{{orderId}}',
  },

  // 48h pencere (Faz 3B.1)
  [NotificationType.ORDER_DELIVERED_CONFIRM]: {
    title: 'Siparişin teslim edildi',
    message: 'Siparişiniz teslim edildi; teslim tarihinden itibaren 14 gün içinde koşulsuz iade hakkınız var. Süre dolunca sipariş otomatik tamamlanır.',
    icon: '📦',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_AUTO_COMPLETED]: {
    title: 'Sipariş otomatik tamamlandı',
    message: '48 saatlik kontrol süresi doldu; sipariş tamamlandı.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_MANUALLY_CONFIRMED]: {
    title: 'Alıcı siparişini onayladı',
    message: 'Alıcı siparişi onayladı. Ödemeniz, teslimden 14 gün sonra (iade süresi dolunca) hesabınıza aktarılır.',
    icon: '💸',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN]: {
    title: 'Sipariş yönetici tarafından tamamlandı',
    message: 'Bir yönetici siparişini manuel olarak tamamladı.',
    icon: '🛡️',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.SELLER_DID_NOT_SHIP_REFUNDED]: {
    title: 'Sipariş iptal edildi',
    message: 'Satıcı belirlenen süre içinde kargoya vermediği için sipariş iptal edildi ve tam iade işlemi başlatıldı.',
    icon: '↩️',
    link: '/orders/{{orderId}}',
  },

  // Offer notifications
  [NotificationType.OFFER_RECEIVED]: {
    title: 'Yeni Teklif Aldınız',
    message: '{{productTitle}} ürününüz için {{amount}} TL teklif aldınız.',
    icon: '💵',
    link: '/offers?tab=received',
  },
  [NotificationType.OFFER_ACCEPTED]: {
    title: 'Teklifiniz Kabul Edildi! 🎉',
    message: '{{productTitle}} için teklifiniz kabul edildi. Hemen ödeyin!',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.OFFER_REJECTED]: {
    title: 'Teklifiniz Reddedildi',
    message: '{{productTitle}} için teklifiniz satıcı tarafından reddedildi.',
    icon: '❌',
    link: '/listings/{{productId}}',
  },
  [NotificationType.OFFER_COUNTER]: {
    title: 'Karşı Teklif Aldınız',
    message: '{{productTitle}} için satıcı {{amount}} TL karşı teklif yaptı.',
    icon: '🔄',
    link: '/offers?tab=sent',
  },
  [NotificationType.OFFER_COUNTER_DECLINED]: {
    title: 'Karşı Teklif Reddedildi',
    message: '{{productTitle}} için alıcı karşı teklifinizi kabul etmedi.',
    icon: '❌',
    link: '/listings/{{productId}}',
  },
  [NotificationType.OFFER_EXPIRED]: {
    title: 'Teklifin Süresi Doldu',
    message: '{{productTitle}} için teklifinizin süresi doldu.',
    icon: '⏰',
    link: '/listings/{{productId}}',
  },
  [NotificationType.OFFER_CANCELLED_OUT_OF_STOCK]: {
    title: 'Teklifiniz iptal edildi: ürün stokta kalmadı',
    message: '{{productTitle}} adlı ürün için verdiğiniz teklif, ürün satıldığı için iptal edildi.',
    icon: '❌',
    link: '/products/unavailable/{{productId}}',
  },

  // Product notifications
  [NotificationType.PRODUCT_APPROVED]: {
    title: 'İlanınız Yayında! 🎉',
    message: '{{productTitle}} ilanınız onaylandı ve yayına alındı.',
    icon: '✅',
    link: '/listings/{{productId}}',
  },
  [NotificationType.PRODUCT_REJECTED]: {
    title: 'İlanınız Reddedildi',
    message: '{{productTitle}} ilanınız onaylanmadı. Neden: {{reason}}',
    icon: '❌',
    link: '/profile/listings',
  },
  [NotificationType.PRODUCT_SOLD]: {
    title: 'Ürününüz Satıldı! 🎉',
    message: '{{productTitle}} ürününüz {{amount}} TL\'ye satıldı.',
    icon: '💰',
    link: '/orders/{{orderId}}',
  },

  // Payment notifications
  [NotificationType.PAYMENT_RECEIVED]: {
    title: 'Ödeme Alındı',
    message: '{{productTitle}} satışından {{amount}} TL ödeme alındı.',
    icon: '💳',
    link: '/profile/earnings',
  },
  [NotificationType.PAYMENT_RELEASED]: {
    title: 'Ödemeniz Aktarıldı',
    message: '{{amount}} TL hesabınıza aktarıldı.',
    icon: '🏦',
    link: '/profile/earnings',
  },

  // Trade notifications
  [NotificationType.TRADE_RECEIVED]: {
    title: 'Yeni Takas Teklifi',
    message: 'Ürünleriniz için bir takas teklifi aldınız.',
    icon: '🔄',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_ACCEPTED]: {
    title: 'Takas Kabul Edildi! 🎉',
    message: 'Takas teklifiniz kabul edildi. Lütfen kargoya verin.',
    icon: '✅',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_REJECTED]: {
    title: 'Takas Reddedildi',
    message: 'Takas teklifiniz reddedildi.',
    icon: '❌',
    link: '/trades',
  },
  [NotificationType.TRADE_COUNTER]: {
    title: 'Karşı Takas Teklifi Aldınız',
    message: '{{counterOffererName}} takas teklifinize karşı teklif yaptı.',
    icon: '🔄',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_SHIPPED]: {
    title: 'Takas Kargoya Verildi',
    message: 'Takas paketiniz kargoya verildi. Takip no: {{trackingNumber}}',
    icon: '🚚',
    link: '/trades/{{tradeId}}',
  },
  [NotificationType.TRADE_COMPLETED]: {
    title: 'Takas Tamamlandı! 🎉',
    message: 'Takas işlemi başarıyla tamamlandı!',
    icon: '🎉',
    link: '/trades/{{tradeId}}',
  },

  // Message notifications
  [NotificationType.NEW_MESSAGE]: {
    title: 'Yeni Mesaj',
    message: '{{senderName}}: {{messagePreview}}',
    icon: '💬',
    // Messages live on a single /messages page that opens a thread via ?thread=<id>.
    // There is no /messages/<id> route, so a path-style link would 404.
    link: '/messages?thread={{threadId}}',
  },

  // Wishlist/Favorites notifications
  [NotificationType.PRICE_DROP]: {
    title: 'Fiyat Düştü! 🔥',
    message: '{{productTitle}} ürününün fiyatı {{oldPrice}} TL\'den {{newPrice}} TL\'ye düştü!',
    icon: '📉',
    link: '/listings/{{productId}}',
  },
  [NotificationType.WISHLIST_ITEM_SOLD]: {
    title: 'Kaçırdınız! 😢',
    message: 'Favorilerinize eklediğiniz {{productTitle}} satıldı.',
    icon: '💔',
    link: '/favorites',
  },
  [NotificationType.BACK_IN_STOCK]: {
    title: 'Tekrar Satışta!',
    message: '{{productTitle}} tekrar satışa çıktı.',
    icon: '🔔',
    link: '/listings/{{productId}}',
  },

  // Social notifications
  [NotificationType.NEW_FOLLOWER]: {
    title: 'Yeni Takipçi',
    message: '{{followerName}} sizi takip etmeye başladı.',
    icon: '👤',
    link: '/seller/{{followerId}}',
  },
  [NotificationType.SELLER_NEW_LISTING]: {
    title: 'Yeni İlan',
    message: '{{sellerName}} yeni bir ilan ekledi: {{productTitle}}',
    icon: '🆕',
    link: '/listings/{{productId}}',
  },
  [NotificationType.COLLECTION_LIKED]: {
    title: 'Koleksiyonunuz Beğenildi',
    message: '{{userName}} koleksiyonunuzu beğendi.',
    icon: '❤️',
    link: '/collections/{{collectionId}}',
  },
  [NotificationType.PRODUCT_LIKED]: {
    title: 'Ürününüz Beğenildi ❤️',
    message: '{{userName}} {{productTitle}} ürününüzü favorilere ekledi.',
    icon: '❤️',
    link: '/listings/{{productId}}',
  },
  [NotificationType.WISHLIST_SOLD]: {
    title: 'Favori Ürününüz Satıldı 😢',
    message: 'Favorilerinize eklediğiniz {{productTitle}} satıldı.',
    icon: '💔',
    link: '/listings/{{productId}}',
  },

  // Review notifications
  [NotificationType.REVIEW_RECEIVED]: {
    title: 'Yeni Değerlendirme',
    message: '{{reviewerName}} size {{score}} yıldız verdi.',
    icon: '⭐',
    link: '/profile',
  },

  // Membership notifications
  [NotificationType.MEMBERSHIP_EXPIRING]: {
    title: 'Üyeliğiniz Bitiyor',
    message: '{{tierName}} üyeliğiniz {{daysLeft}} gün içinde sona erecek.',
    icon: '⏰',
    link: '/pricing',
  },
  [NotificationType.MEMBERSHIP_EXPIRED]: {
    title: 'Üyeliğiniz Sona Erdi',
    message: '{{tierName}} üyeliğiniz sona erdi. Yenileyin ve avantajlardan yararlanın!',
    icon: '⚠️',
    link: '/pricing',
  },
  [NotificationType.MEMBERSHIP_UPGRADED]: {
    title: 'Üyeliğiniz Yükseltildi! 🎉',
    message: '{{tierName}} üyeliğine hoş geldiniz! Yeni avantajlarınız aktif.',
    icon: '👑',
    link: '/profile',
  },

  // Listing notifications
  [NotificationType.LISTING_EXPIRING]: {
    title: 'İlanınız Bitiyor',
    message: '{{productTitle}} ilanınız {{daysLeft}} gün içinde sona erecek.',
    icon: '⏰',
    link: '/listings/{{productId}}',
  },
  [NotificationType.LISTING_EXPIRED]: {
    title: 'İlanınız Sona Erdi',
    message: '{{productTitle}} ilanınız sona erdi. Yeniden yayınlayın.',
    icon: '⚠️',
    link: '/profile/listings',
  },
  [NotificationType.LISTING_VIEWS_MILESTONE]: {
    title: 'Tebrikler! 🎉',
    message: '{{productTitle}} ilanınız {{viewCount}} görüntülemeye ulaştı!',
    icon: '👀',
    link: '/listings/{{productId}}',
  },

  // Promotion notifications
  [NotificationType.PROMOTION]: {
    title: '🎁 Özel Kampanya',
    message: '{{promotionTitle}}',
    icon: '🎁',
    link: '{{promotionLink}}',
  },
  [NotificationType.SPECIAL_OFFER]: {
    title: '💎 Özel Teklif',
    message: '{{offerDescription}}',
    icon: '💎',
    link: '{{offerLink}}',
  },

  // General notifications
  [NotificationType.WELCOME]: {
    title: "Tarodan'a Hoş Geldiniz! 🎉",
    message: 'Diecast model araba koleksiyoncuları platformuna hoş geldiniz.',
    icon: '🎉',
    link: '/listings',
  },
  [NotificationType.PASSWORD_RESET]: {
    title: 'Şifre Sıfırlama',
    message: 'Şifrenizi sıfırlamak için linke tıklayın.',
    icon: '🔐',
  },
  [NotificationType.EMAIL_VERIFICATION]: {
    title: 'E-posta Doğrulama',
    message: 'E-postanızı doğrulamak için linke tıklayın.',
    icon: '📧',
  },
  [NotificationType.SYSTEM_ANNOUNCEMENT]: {
    title: '📢 Duyuru',
    message: '{{announcement}}',
    icon: '📢',
    link: '{{announcementLink}}',
  },
  [NotificationType.BOOST_EXPIRED]: {
    title: '🚀 Öne çıkarma süresi doldu',
    message:
      '"{{productTitle}}" ilanının öne çıkarması bitti. Otomatik yenileme açıktı — tek tıkla yeniden öne çıkar.',
    icon: '🚀',
    link: '/profile/listings',
  },
  [NotificationType.TRADE_AUTO_CANCELLED]: {
    title: 'Takas Otomatik İptal Edildi',
    message: '{{cancelReason}}',
    icon: '🔄',
    link: '/trades',
  },
  [NotificationType.TRADE_STUCK_AT_WAREHOUSE]: {
    title: 'Sıkışmış Takas — Yönetim Gerekli',
    message:
      '{{tradeNumber}} takası depoya ulaştı fakat süresi doldu; elle force-cancel-stuck gerekiyor.',
    icon: '⚠️',
    link: '/trades',
  },
  [NotificationType.OFFER_AUTO_REJECTED]: {
    title: 'Teklifiniz Kapatıldı',
    message: '{{cancelReason}}',
    icon: '💰',
    link: '/offers',
  },
  [NotificationType.RESERVATION_EXPIRED]: {
    title: 'Sipariş Süresi Doldu',
    message: 'Siparişinizin ödeme süresi dolduğu için otomatik olarak iptal edildi.',
    icon: '⏰',
    link: '/orders',
  },
  [NotificationType.REFUND_CANCELLED]: {
    title: 'İade Talebi İptal Edildi',
    message: 'Alıcı {{refundNumber}} numaralı iade talebini iptal etti.',
    icon: '↩️',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_APPROVED]: {
    title: 'İade Talebiniz Onaylandı',
    message: '{{refundNumber}} numaralı iade talebiniz onaylandı.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_OPENED]: {
    title: 'İade Kargosu Hazır',
    message: '{{trackingNumber}} numarasıyla ürünü en yakın Sürat şubesine teslim edebilirsiniz.',
    icon: '📦',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_COMPLETED]: {
    title: 'İadeniz Tamamlandı',
    message: '{{refundNumber}} numaralı iadeniz hesabınıza yansıtıldı.',
    icon: '💰',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_REQUEST_RECEIVED]: {
    title: 'İade Talebiniz Alındı',
    message: '{{refundNumber}} numaralı iade talebiniz alındı, satıcı yanıtı bekleniyor.',
    icon: '📨',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_SHIPPED_SELLER]: {
    title: 'İade Kargosu Yola Çıktı',
    message: 'Alıcı {{refundNumber}} numaralı iade için ürünü kargoya verdi; ürün size geliyor.',
    icon: '📦',
    link: '/sales/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_IN_TRANSIT]: {
    title: 'İade Kargonuz Yolda',
    message: '{{refundNumber}} numaralı iade ürününüz satıcıya doğru yolda.',
    icon: '🚚',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_DELIVERED_BUYER]: {
    title: 'İadeniz Satıcıya Ulaştı',
    message: '{{refundNumber}} numaralı iade ürününüz satıcıya teslim edildi; para iadeniz kısa sürede yapılacak.',
    icon: '✅',
    link: '/orders/{{orderId}}',
  },
  [NotificationType.REFUND_RETURN_DELIVERED_SELLER]: {
    title: 'İade Ürünü Size Ulaştı',
    message: '{{refundNumber}} numaralı iade ürünü size teslim edildi.',
    icon: '📥',
    link: '/sales/{{orderId}}',
  },
  [NotificationType.REFUND_COMPLETED_SELLER]: {
    title: 'İade Tamamlandı',
    message: '{{refundNumber}} numaralı sipariş için iade tamamlandı; tutar alıcıya iade edildi.',
    icon: '↩️',
    link: '/sales/{{orderId}}',
  },
  [NotificationType.REFUND_AUTO_ACCEPTED_SELLER]: {
    title: 'İade Talebi Otomatik Onaylandı',
    message: '{{refundNumber}} numaralı iade talebine 48 saat içinde yanıt verilmediği için otomatik onaylandı.',
    icon: '⏰',
    link: '/sales/{{orderId}}',
  },

  // Seller application notifications
  [NotificationType.SELLER_APPLICATION_APPROVED]: {
    title: 'Kurumsal Başvurunuz Onaylandı! 🎉',
    message: 'Kurumsal hesap başvurunuz onaylandı. Artık satıcı olarak ürün listeleyebilirsiniz.',
    icon: '✅',
    link: '/profile',
  },
  [NotificationType.SELLER_APPLICATION_REJECTED]: {
    title: 'Kurumsal Başvurunuz Reddedildi',
    message: 'Kurumsal hesap başvurunuz reddedildi.{{reason}}',
    icon: '❌',
    link: '/profile',
  },
};
