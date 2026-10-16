/**
 * Expo push teslimatının DI'sız kuralları — dispatch (ana yol), push worker
 * (kuyruk yolu) ve makbuz (receipt) kontrolü aynı kararı verir.
 *
 * Neden tek dosya: kanal seçimi worker'da tipten türetiliyordu, ana yol hep
 * `default` gönderiyordu (Android'de sipariş/takas/mesaj bildirimleri kendi
 * kanallarına düşmüyordu). Hata sınıflandırması da yalnız worker'da vardı.
 */

/**
 * Android bildirim kanalları — mobil istemcinin oluşturduğu kanallarla
 * BİREBİR aynı kimlikler (tarodan-mobile `src/services/push.ts`). Olmayan bir
 * kanal kimliği gönderilirse Android bildirimi varsayılan kanala düşürür.
 */
export type PushChannelId = "default" | "orders" | "trades" | "messages";

/** Ödeme/sipariş/iade akışı: alıcı ve satıcı sipariş ekranına giden tipler. */
const ORDER_CHANNEL_PREFIXES = ["order", "payment", "refund", "reservation"];
const ORDER_CHANNEL_TYPES = new Set([
  "product_sold",
  "cargo_code_ready",
  "cargo_movement_missing",
  "seller_address_required",
  "seller_did_not_ship_refunded",
]);

/** Bildirim tipinden Android kanal kimliği. */
export function pushChannelFor(type: unknown): PushChannelId {
  if (typeof type !== "string" || !type) return "default";
  if (type === "new_message" || type.startsWith("message")) return "messages";
  if (type.startsWith("trade")) return "trades";
  if (
    ORDER_CHANNEL_TYPES.has(type) ||
    ORDER_CHANNEL_PREFIXES.some((prefix) => type.startsWith(prefix))
  ) {
    return "orders";
  }
  return "default";
}

/** Expo'nun tek istekte kabul ettiği en fazla mesaj. */
export const EXPO_SEND_BATCH_SIZE = 100;
/** Expo `getReceipts` tek istekte en fazla 1000 kimlik kabul eder. */
export const EXPO_RECEIPT_BATCH_SIZE = 1000;
/**
 * Makbuzlar gönderimden ~15 dk sonra okunur (Expo önerisi: APNs/FCM sonucu
 * hemen hazır olmaz; makbuzlar 24 saat saklanır).
 */
export const EXPO_RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
/**
 * Expo isteğinin üst sınırı. İş isteği bildirime hiç beklemez (ana yol
 * arka planda gönderir) ama asılı bir bağlantı süreç kapanışını da bekletmesin.
 */
export const EXPO_REQUEST_TIMEOUT_MS = 10_000;

/** Expo Push token biçimi. */
export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(token)
  );
}

/**
 * Expo bilet/makbuz hata kodunun sınıfı.
 *  - `device_not_registered`: uygulama silinmiş / token geçersiz → token pasifleşir.
 *  - `credentials`: APNs/FCM kimlik bilgisi sorunu (InvalidCredentials,
 *    MismatchSenderId) → HİÇBİR cihaza gitmiyor demektir; ayrı alarm.
 *  - `message_too_big`: yük 4 KB'ı aşıyor → üretici hatası; ayrı alarm.
 *  - `rate_limited`: MessageRateExceeded → geçici.
 */
export type ExpoPushErrorKind =
  | "device_not_registered"
  | "credentials"
  | "message_too_big"
  | "rate_limited"
  | "other";

export function classifyExpoPushError(code: unknown): ExpoPushErrorKind {
  switch (code) {
    case "DeviceNotRegistered":
      return "device_not_registered";
    case "InvalidCredentials":
    case "MismatchSenderId":
      return "credentials";
    case "MessageTooBig":
      return "message_too_big";
    case "MessageRateExceeded":
      return "rate_limited";
    default:
      return "other";
  }
}

/** Makbuz kontrolü için saklanan bilet: kimlik + gittiği token. */
export interface PushTicketRef {
  id: string;
  token: string;
}

/** `push` kuyruğundaki makbuz kontrol işinin adı ve verisi. */
export const PUSH_RECEIPT_JOB = "check-receipts";
export interface PushReceiptJobData {
  tickets: PushTicketRef[];
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
