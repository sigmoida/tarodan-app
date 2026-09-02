import { Logger } from "@nestjs/common";
import { NotificationType } from "../dto";
import { isSafeFreeLink } from "./notification-link-safety";

export { isSafeFreeLink };

/**
 * Bildirim hedeflerinin TEK kaynağı.
 *
 * Link üretimi üç ayrı yerde yapılıyordu ve üçü de farklı sonuç veriyordu:
 * push worker `data` alanlarına bakarak kendi yolunu kuruyor (`/orders/:id`
 * gibi web'de OLMAYAN yollar), kargo servisi doğrudan serbest link gönderiyor,
 * dispatch ise şablonu enterpole ederken eksik değişkeni `{{orderId}}` olarak
 * linkin İÇİNDE bırakıyordu. Tıklanan bildirim 404'e gidiyordu.
 *
 * Kurallar:
 *  - Hedef, `data` içinde hangi alan varsa ona göre DEĞİL, bildirim TİPİNE göre
 *    seçilir. Aynı siparişi alıcıya ve satıcıya gönderen tipler ayrı ekranlara
 *    gider (ör. REFUND_RETURN_SHIPPED_SELLER → satıcı ekranı).
 *  - Harita `Record<NotificationType, ...>` olduğu için yeni bir tip eklendiğinde
 *    derleme HATA verir; hedefi unutulamaz.
 *  - Zorunlu alanlar desenden türetilir (`{{orderId}}` → `orderId` zorunlu).
 *  - Dinamik parçalar URL-encode edilir.
 *  - Eksik alan varsa link ÜRETİLMEZ (`null`) — `{{...}}` içeren bir hedef asla
 *    kaydedilmez. Bildirim hatası ticaret akışını durdurmaz; uyarı loglanır.
 */

const logger = new Logger("NotificationLink");

/** Serbest link taşıyan tipler: hedef üretici tarafından verilir. */
export interface FreeLinkSpec {
  kind: "free";
  /** `data` içindeki link alanı. */
  key: string;
}

/** Sabit desen: `{{token}}` parçaları `data`dan doldurulur. */
export interface PatternLinkSpec {
  kind: "pattern";
  pattern: string;
  /**
   * Zorunlu alan gelmediğinde gidilecek LİSTE ekranı.
   *
   * Yalnız üreticinin tekil kaydı bilemediği tipler içindir (sepet ödemesi tek
   * `checkoutGroupId` gönderiyor, tek bir `orderId` yok). Genel bir kaçış
   * değildir: fallback'i olmayan tipte eksik alan hâlâ linksiz bildirim
   * demektir, çünkü yanlış ekrana götürmek 404'ten iyi değildir.
   */
  fallback?: string;
}

/**
 * Aynı tip hem alıcıya hem satıcıya gidiyorsa hedef TEK BAŞINA tipten
 * çıkarılamaz: `data.audience` ile ayrılır. Üretici kime gönderdiğini bilir.
 */
export interface AudienceLinkSpec {
  kind: "audience";
  buyer: string;
  seller: string;
}

/** Hedefi olmayan tip (yalnız e-posta/bilgilendirme). */
export interface NoLinkSpec {
  kind: "none";
}

export type NotificationLinkSpec =
  PatternLinkSpec | AudienceLinkSpec | FreeLinkSpec | NoLinkSpec;

/** Bildirimin gönderildiği taraf; `data.audience` ile taşınır. */
export type NotificationAudience = "buyer" | "seller";

const pattern = (value: string, fallback?: string): PatternLinkSpec => ({
  kind: "pattern",
  pattern: value,
  ...(fallback ? { fallback } : {}),
});
const free = (key: string): FreeLinkSpec => ({ kind: "free", key });
/**
 * Alıcı/satıcı ayrımı YALNIZ `data.audience`tan gelir; varsayılanı yoktur.
 *
 * Eskiden `audience` yoksa alıcı varsayılıyordu: satıcıya giden bildirim
 * sessizce alıcının ekranını açıyordu ve bu hiçbir yerde hata olarak
 * görünmüyordu. Artık üretici kime gönderdiğini SÖYLEMEK zorunda.
 */
const byAudience = (buyer: string, seller: string): AudienceLinkSpec => ({
  kind: "audience",
  buyer,
  seller,
});
const none: NoLinkSpec = { kind: "none" };

/** Alıcının kendi sipariş ekranı. */
const BUYER_ORDER = pattern("/profile/orders/{{orderId}}");
/** Satıcının sipariş ekranı — aynı sipariş, farklı hedef kitle. */
const SELLER_ORDER = pattern("/seller/orders/{{orderId}}");
const TRADE = pattern("/profile/trades/{{tradeId}}");
const LISTING = pattern("/listings/{{productId}}");
const UNAVAILABLE = pattern("/products/unavailable/{{productId}}");

export const NOTIFICATION_LINKS: Record<
  NotificationType,
  NotificationLinkSpec
> = {
  // ── Sipariş (alıcı) ──────────────────────────────────────────────────────
  [NotificationType.ORDER_CREATED]: BUYER_ORDER,
  [NotificationType.ORDER_PAID]: byAudience(
    "/profile/orders/{{orderId}}",
    "/seller/orders/{{orderId}}",
  ),
  [NotificationType.ORDER_SHIPPED]: BUYER_ORDER,
  [NotificationType.ORDER_DELIVERED]: BUYER_ORDER,
  [NotificationType.ORDER_COMPLETED]: BUYER_ORDER,
  [NotificationType.ORDER_CANCELLED]: BUYER_ORDER,
  [NotificationType.ORDER_REFUNDED]: BUYER_ORDER,
  [NotificationType.ORDER_PREPARING_DEADLINE_WARNING]: byAudience(
    "/profile/orders/{{orderId}}",
    "/seller/orders/{{orderId}}",
  ),
  [NotificationType.ORDER_RESERVATION_RELEASED]: BUYER_ORDER,
  [NotificationType.ORDER_DELIVERED_CONFIRM]: BUYER_ORDER,
  [NotificationType.ORDER_AUTO_COMPLETED]: byAudience(
    "/profile/orders/{{orderId}}",
    "/seller/orders/{{orderId}}",
  ),
  [NotificationType.ORDER_MANUALLY_CONFIRMED]: byAudience(
    "/profile/orders/{{orderId}}",
    "/seller/orders/{{orderId}}",
  ),
  [NotificationType.SELLER_DID_NOT_SHIP_REFUNDED]: BUYER_ORDER,
  [NotificationType.RESERVATION_EXPIRED]: pattern("/profile/orders"),

  // ── Sipariş (satıcı) ─────────────────────────────────────────────────────
  [NotificationType.ORDER_CANCELLED_SELLER]: SELLER_ORDER,
  [NotificationType.PRODUCT_SOLD]: SELLER_ORDER,
  [NotificationType.CARGO_MOVEMENT_MISSING]: SELLER_ORDER,
  // Alıcıya VE satıcıya gider (order-scheduler ikisine de atar): hedef ekran
  // tipten değil `audience`tan seçilir. Eski sabit alıcı deseni satıcıyı
  // alıcının sipariş ekranına götürüyordu.
  [NotificationType.ORDER_SHIPMENT_DELAYED]: byAudience(
    "/profile/orders/{{orderId}}",
    "/seller/orders/{{orderId}}",
  ),
  // Admin alarmı: yalnız admin'lere gider. Tüketici sitesindeki `/profile/...`
  // ekranı adminin oturumunda açılmaz — hedef admin panelindeki sipariş
  // dosyasıdır (serbest link, üretici verir).
  [NotificationType.ORDER_STUCK_IN_TRANSIT]: free("adminLink"),
  // Satıcının ürünü satışa kapandı: alıcı tarafındaki "artık satışta değil"
  // sayfası, kaldırılmış ürünün 404'üne gitmesin.
  [NotificationType.ORDER_CANCELLED_OUT_OF_STOCK]: UNAVAILABLE,

  // ── Teklif ───────────────────────────────────────────────────────────────
  [NotificationType.OFFER_RECEIVED]: pattern("/profile/offers?tab=received"),
  [NotificationType.OFFER_COUNTER]: pattern("/profile/offers?tab=sent"),
  [NotificationType.OFFER_AUTO_REJECTED]: pattern("/profile/offers"),
  // Kabul edilen teklifte HENÜZ SİPARİŞ YOKTUR: alıcının ödemesi gerekir.
  // Harita `orderId` istiyordu ama üretici onu hiç göndermiyor; bu yüzden
  // link üretilemiyordu. Hedef, alıcının satın almayı tamamlayacağı ilandır.
  // Kabul edilen teklifte tek iş ÖDEME: hedef ilan değil, ödenecek sipariştir.
  // (Sipariş henüz oluşmadıysa alıcının teklif listesine düşer.)
  [NotificationType.OFFER_ACCEPTED]: pattern(
    "/profile/orders/{{orderId}}",
    "/profile/offers",
  ),
  [NotificationType.OFFER_COUNTER_ACCEPTED]: pattern(
    "/seller/orders/{{orderId}}",
    "/profile/offers",
  ),
  [NotificationType.OFFER_PAYMENT_EXPIRED]: BUYER_ORDER,
  [NotificationType.OFFER_REJECTED]: LISTING,
  [NotificationType.OFFER_COUNTER_DECLINED]: LISTING,
  [NotificationType.OFFER_EXPIRED]: LISTING,
  [NotificationType.OFFER_EXPIRED_SELLER]: LISTING,
  [NotificationType.OFFER_CANCELLED_OUT_OF_STOCK]: UNAVAILABLE,
  [NotificationType.OFFER_CANCELLED_LISTING_REMOVED]: UNAVAILABLE,
  [NotificationType.OFFER_CANCELLED_BY_ADMIN]: LISTING,

  // ── Ürün / ilan ──────────────────────────────────────────────────────────
  [NotificationType.PRODUCT_APPROVED]: LISTING,
  [NotificationType.PRODUCT_REJECTED]: pattern("/profile/listings"),
  [NotificationType.PRICE_DROP]: LISTING,
  [NotificationType.BACK_IN_STOCK]: LISTING,
  [NotificationType.SELLER_NEW_LISTING]: LISTING,
  [NotificationType.PRODUCT_LIKED]: LISTING,
  [NotificationType.WISHLIST_SOLD]: LISTING,
  [NotificationType.WISHLIST_ITEM_SOLD]: pattern("/profile/favorites"),
  [NotificationType.LISTING_EXPIRING]: LISTING,
  [NotificationType.LISTING_EXPIRED]: pattern("/profile/listings"),
  [NotificationType.LISTING_VIEWS_MILESTONE]: LISTING,
  [NotificationType.BOOST_EXPIRED]: pattern("/profile/listings"),
  [NotificationType.BOOST_ACTIVATED]: pattern("/profile/listings"),

  // ── Ödeme (satıcıya) ─────────────────────────────────────────────────────
  // Hedef kitle TİPTEN belli: ikisi de satıcıya gider, `orderId` varlığına
  // bakılarak alıcı ekranı seçilmez.
  [NotificationType.PAYMENT_RECEIVED]: pattern("/profile/payments"),
  [NotificationType.PAYMENT_RELEASED]: pattern("/profile/payments"),

  // ── Takas ────────────────────────────────────────────────────────────────
  [NotificationType.TRADE_RECEIVED]: TRADE,
  [NotificationType.TRADE_ACCEPTED]: TRADE,
  [NotificationType.TRADE_COUNTER]: TRADE,
  [NotificationType.TRADE_SHIPPED]: TRADE,
  [NotificationType.TRADE_COMPLETED]: TRADE,
  [NotificationType.TRADE_REJECTED]: pattern("/profile/trades"),
  [NotificationType.TRADE_AUTO_CANCELLED]: pattern("/profile/trades"),
  [NotificationType.TRADE_AT_WAREHOUSE]: TRADE,
  // Admin alarmları: yalnız admin'lere gider — kullanıcı sitesindeki takas
  // listesi değil, admin panelindeki takas dosyası açılmalı (serbest link).
  [NotificationType.TRADE_STUCK_AT_WAREHOUSE]: free("adminLink"),
  [NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING]: free("adminLink"),
  [NotificationType.TRADE_ADDRESS_REQUIRED]: pattern("/profile/trades"),
  // Satıcıyı doğrudan siparişe götür (adres eksikliği orada anlatılır); sipariş
  // kimliği yoksa adres yönetimine düşer.
  [NotificationType.SELLER_ADDRESS_REQUIRED]: pattern(
    "/seller/orders/{{orderId}}",
    "/profile/addresses",
  ),
  // Kargo kodu satış siparişinin gönderenine (satıcı) gider; takas bacağı için
  // üretilirse orderId olmaz ve takas listesine düşer.
  [NotificationType.CARGO_CODE_READY]: pattern(
    "/seller/orders/{{orderId}}",
    "/profile/trades",
  ),

  // Kupon geri verildi: kod mesajın içinde; gidilecek tekil ekran yok.
  [NotificationType.COUPON_RETURNED]: none,
  // Admin'e gider: hedef admin panelindeki kampanya listesi (serbest link).
  [NotificationType.CAMPAIGN_BUDGET_EXHAUSTED]: free("adminLink"),
  // Admin'e gider: bekleyen ilan kuyruğu (serbest link).
  [NotificationType.MODERATION_QUEUE_STALE]: free("adminLink"),
  // Admin'e gider: engellenen kullanıcının / şikayetin admin paneli sayfası.
  [NotificationType.USER_BLOCKED_ADMIN]: free("adminLink"),
  [NotificationType.USER_REPORTED_ADMIN]: free("adminLink"),

  // ── İade ─────────────────────────────────────────────────────────────────
  // İKİ yöne de gider: alıcı kendi talebini iptal edince SATICIYA ("iade talebi
  // iptal edildi"), sistem/admin kapatınca ALICIYA. Sabit alıcı deseni satıcıyı
  // alıcının sipariş ekranına deep-link'liyordu — hedef `audience` ile ayrılır.
  [NotificationType.REFUND_CANCELLED]: byAudience(
    "/profile/orders/{{orderId}}",
    "/seller/orders/{{orderId}}",
  ),
  [NotificationType.REFUND_APPROVED]: BUYER_ORDER,
  [NotificationType.REFUND_RETURN_OPENED]: BUYER_ORDER,
  [NotificationType.REFUND_COMPLETED]: BUYER_ORDER,
  [NotificationType.REFUND_REQUEST_RECEIVED]: BUYER_ORDER,
  [NotificationType.REFUND_REQUEST_RECEIVED_SELLER]: SELLER_ORDER,
  [NotificationType.REFUND_REVIEW_REQUIRED_ADMIN]: free("adminLink"),
  [NotificationType.REFUND_RETURN_IN_TRANSIT]: BUYER_ORDER,
  [NotificationType.REFUND_RETURN_DELIVERED_BUYER]: BUYER_ORDER,
  [NotificationType.REFUND_RETURN_SHIPPED_SELLER]: SELLER_ORDER,
  [NotificationType.REFUND_RETURN_DELIVERED_SELLER]: SELLER_ORDER,
  [NotificationType.REFUND_COMPLETED_SELLER]: SELLER_ORDER,
  [NotificationType.REFUND_AUTO_ACCEPTED_SELLER]: SELLER_ORDER,

  // ── Mesajlaşma ───────────────────────────────────────────────────────────
  [NotificationType.NEW_MESSAGE]: pattern(
    "/profile/messages?thread={{threadId}}",
  ),

  // ── Sosyal ───────────────────────────────────────────────────────────────
  [NotificationType.NEW_FOLLOWER]: pattern("/seller/{{followerId}}"),
  [NotificationType.COLLECTION_LIKED]: pattern("/collections/{{collectionId}}"),
  [NotificationType.REVIEW_RECEIVED]: pattern("/profile"),

  // ── Üyelik / hesap ───────────────────────────────────────────────────────
  [NotificationType.MEMBERSHIP_EXPIRING]: pattern("/membership"),
  [NotificationType.MEMBERSHIP_EXPIRED]: pattern("/membership"),
  [NotificationType.MEMBERSHIP_UPGRADED]: pattern("/profile"),
  [NotificationType.SELLER_APPLICATION_APPROVED]: pattern("/profile"),
  [NotificationType.SELLER_APPLICATION_REJECTED]: pattern("/profile"),
  [NotificationType.WELCOME]: pattern("/listings"),

  // ── Serbest link (yönetici/kampanya) ─────────────────────────────────────
  [NotificationType.PROMOTION]: free("promotionLink"),
  [NotificationType.SPECIAL_OFFER]: free("offerLink"),
  [NotificationType.SYSTEM_ANNOUNCEMENT]: free("announcementLink"),

  // ── EventService'in yazdığı tipler ───────────────────────────────────────
  // Bunlar enum dışındaydı ve linksiz kaydediliyordu.
  // Yalnız ALICIYA gider (satıcının karşılığı PAYMENT_RECEIVED). Sepet ödemesi
  // tek bir sipariş göstermediği için temsilci sipariş yoksa listeye düşer.
  [NotificationType.PAYMENT_CONFIRMED]: pattern(
    "/profile/orders/{{orderId}}",
    "/profile/orders",
  ),
  [NotificationType.PAYMENT_FAILED]: pattern("/profile/orders/{{orderId}}"),
  [NotificationType.PAYMENT_REFUNDED]: byAudience(
    "/profile/orders/{{orderId}}",
    "/seller/orders/{{orderId}}",
  ),
  [NotificationType.TRADE_READY_FOR_SHIPPING]: TRADE,
  [NotificationType.TRADE_WAREHOUSE_APPROVED]: TRADE,
  [NotificationType.TRADE_WAREHOUSE_REJECTED]: TRADE,
  [NotificationType.TRADE_CANCEL_LOCKED]: TRADE,
  [NotificationType.TRADE_RETURN_COMPLETED]: TRADE,
  [NotificationType.TRADE_RETURN_LOST]: TRADE,
  [NotificationType.TRADE_REFUND_FAILED]: TRADE,
  [NotificationType.TRADE_REFUND_COMPLETED]: TRADE,
  // Yönetici yayını: hedef dışarıdan gelir, DTO sınırında doğrulanır.
  [NotificationType.ADMIN_BROADCAST]: free("link"),

  // ── Hedefi olmayanlar (yalnız e-posta) ───────────────────────────────────
  [NotificationType.PASSWORD_RESET]: none,
  [NotificationType.EMAIL_VERIFICATION]: none,
};

const KNOWN_TYPES = new Set<string>(Object.values(NotificationType));

/**
 * Gelen string, kalıcı olarak yazılabilen bir bildirim tipi mi?
 *
 * Push worker `as NotificationType` ile cast ediyordu; enum dışı tipler
 * derlemeden geçip resolver'da `null` dönüyor ve bildirim LİNKSİZ
 * kaydediliyordu. Cast yerine bu kapı kullanılır.
 */
export function isKnownNotificationType(
  value: unknown,
): value is NotificationType {
  return typeof value === "string" && KNOWN_TYPES.has(value);
}

const TOKEN = /\{\{(\w+)\}\}/g;

/** Desende geçen zorunlu `data` alanları. */
export function requiredFieldsFor(type: NotificationType): string[] {
  const spec = NOTIFICATION_LINKS[type];
  if (spec?.kind === "free") return [spec.key];
  if (spec?.kind === "audience") {
    // `audience` da zorunludur: hangi ekranın açılacağı ona bağlı.
    return ["audience", ...[...spec.buyer.matchAll(TOKEN)].map((m) => m[1])];
  }
  if (spec?.kind !== "pattern") return [];
  return [...spec.pattern.matchAll(TOKEN)].map((match) => match[1]);
}

/**
 * Bildirimin web hedefi. Çözülemezse `null` — asla `{{...}}` içeren bir link
 * döndürmez.
 */
export function resolveWebNotificationLink(
  type: NotificationType,
  data?: Record<string, unknown> | null,
): string | null {
  const spec = NOTIFICATION_LINKS[type];
  if (!spec) {
    logger.warn(`Bildirim tipi için hedef tanımlı değil: ${type}`);
    return null;
  }
  if (spec.kind === "none") return null;

  if (spec.kind === "free") {
    const raw = data?.[spec.key];
    const link = typeof raw === "string" ? raw.trim() : "";
    if (!link || !isSafeFreeLink(link)) {
      logger.warn(
        `Serbest bildirim linki reddedildi type=${type} key=${spec.key}`,
      );
      return null;
    }
    return link;
  }

  // Hedef kitle YALNIZ `data.audience`tan gelir. Aynı tip iki tarafa
  // gidebildiği için `orderId` varlığına bakarak ekran seçilemez; eksikse
  // alıcı VARSAYILMAZ — yanlış ekran açmaktansa link üretilmez.
  let template: string;
  if (spec.kind === "audience") {
    const audience = data?.audience;
    if (audience !== "buyer" && audience !== "seller") {
      logger.warn(
        `Bildirim linki üretilemedi type=${type} eksikAlan=audience` +
          ` (üretici hedef kitleyi bildirmeli)`,
      );
      return null;
    }
    template = audience === "seller" ? spec.seller : spec.buyer;
  } else {
    template = spec.pattern;
  }

  let missing: string | null = null;
  const resolved = template.replace(TOKEN, (_match, key: string) => {
    const value = data?.[key];
    if (value === undefined || value === null || value === "") {
      missing = key;
      return "";
    }
    // Dinamik parça yola giriyor: encode edilmeden bırakılamaz.
    return encodeURIComponent(String(value));
  });

  if (missing) {
    if (spec.kind === "pattern" && spec.fallback) {
      logger.warn(
        `Bildirim linki listeye düşürüldü type=${type} eksikAlan=${missing}` +
          ` hedef=${spec.fallback}`,
      );
      return spec.fallback;
    }
    logger.warn(`Bildirim linki üretilemedi type=${type} eksikAlan=${missing}`);
    return null;
  }
  return resolved;
}

/**
 * Kaydedilmiş ESKİ linkleri bugünkü route'lara çevirir.
 *
 * Veritabanında push worker'ın ürettiği `/orders/:id` gibi yollar duruyor.
 * Okuma anında düzeltmek, migration olmadan eski bildirimlerin de 404'e
 * gitmesini engeller.
 */
export function normalizeLegacyNotificationLink(
  link: string | null | undefined,
): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  // Çözülmemiş şablon değişkeni taşıyan link kullanılamaz.
  if (trimmed.includes("{{")) return null;
  if (!trimmed.startsWith("/")) {
    return isSafeFreeLink(trimmed) ? trimmed : null;
  }
  // Protocol-relative (`//evil.com`) iç link değildir.
  if (trimmed.startsWith("//")) return null;

  const rules: Array<[RegExp, string]> = [
    [/^\/orders(\/|\?|$)/, "/profile/orders$1"],
    [/^\/offers(\/|\?|$)/, "/profile/offers$1"],
    [/^\/trades(\/|\?|$)/, "/profile/trades$1"],
    [/^\/messages(\/|\?|$)/, "/profile/messages$1"],
    [/^\/products\/unavailable(\/|\?|$)/, "/products/unavailable$1"],
    [/^\/products(\/|\?|$)/, "/listings$1"],
  ];
  let rewritten = trimmed;
  for (const [from, to] of rules) {
    if (from.test(trimmed)) {
      rewritten = trimmed.replace(from, to);
      break;
    }
  }
  // Yeniden yazmak yetmiyor: eski satırda `/olmayan-bir-sayfa` ya da ters bölü
  // ile origin'den kaçan bir yol olabilir. Serbest link ile AYNI kapıdan geçer.
  return isSafeFreeLink(rewritten) ? rewritten : null;
}
