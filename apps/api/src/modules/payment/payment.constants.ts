/**
 * Faz 9.2: Ödeme sabitleri + config anahtarları için tek referans. Kod tabanında
 * dağınık "magic number"lar (para epsilon 0.01, pencere süreleri) ve env anahtarları
 * vardı; bu dosya tek kaynak olarak toplar. Config-tabanlı değerler ConfigService/env
 * ile okunur (varsayılanları burada belgelenir) — sabitler (epsilon) doğrudan kullanılır.
 */

/**
 * Para karşılaştırma epsilon'u (kuruş yuvarlama toleransı). `>= X - MONEY_EPSILON` /
 * `> cap + MONEY_EPSILON` kalıplarında kullanılır. Tek yerden yönetilir ki tüm para
 * karşılaştırmaları tutarlı olsun.
 */
export const MONEY_EPSILON = 0.01;

/**
 * Ödeme/iade ile ilgili env config anahtarları ve varsayılanları (tek referans).
 * Kodda `configService.get(KEY) || DEFAULT` deseniyle okunur.
 */
/**
 * NOT — takas escrow'u burada DEĞİL: takasın onay/hold pencereleri DB
 * ayarlarından (PlatformSetting) okunur ve tek kaynakları
 * `common/helpers/trade-escrow.ts` dosyasıdır.
 */
export const PAYMENT_CONFIG_KEYS = {
  /** Ödeme satırını `failed` yapma penceresi (dk). PayTR 3DS ~30dk > bu olmalı. */
  FAIL_TIMEOUT_MINUTES: {
    key: "PAYMENT_FAIL_TIMEOUT_MINUTES",
    default: 35,
    min: 1,
  },
  /**
   * İade talep penceresi (gün) = alıcının koşulsuz cayma süresi. Satıcı payout
   * uygunluğu (teslim + bu + grace) ve "iade edilebilir mi" kontrolü AYNI
   * değerden beslenir — ikisi ayrı sabitlerden okununca pencereler kayıyordu.
   */
  RETURN_WINDOW_DAYS: { key: "RETURN_WINDOW_DAYS", default: 14, min: 1 },
  /** Payout uygunluğu grace (gün) — iade penceresinden sonra. */
  PAYOUT_GRACE_DAYS: { key: "PAYOUT_GRACE_DAYS", default: 1, min: 1 },
  /** Satıcı hazırlık (kargoya verme) son tarihi (gün). */
  PREPARING_DEADLINE_DAYS: {
    key: "PREPARING_DEADLINE_DAYS",
    default: 3,
    min: 1,
  },
  /** PayTR reconcile tutar toleransı (TL). */
  RECONCILE_AMOUNT_TOLERANCE_TL: {
    key: "PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL",
    default: 0.05,
  },
  /** İade drop-off (şubeye götürme) süresi (gün) — D25. */
  RETURN_DROPOFF_DAYS: {
    key: "REFUND_RETURN_DROPOFF_DAYS",
    default: 7,
    min: 1,
  },
  /** wait_for_delivery'de takılı iade timeout (gün) — MONEY-H6. */
  WAIT_DELIVERY_MAX_DAYS: {
    key: "REFUND_WAIT_DELIVERY_MAX_DAYS",
    default: 30,
    min: 1,
  },
  /** İade sonrası satıcı inceleme penceresi (saat) — D26. */
  RETURN_INSPECTION_HOURS: {
    key: "REFUND_RETURN_INSPECTION_HOURS",
    default: 24,
    min: 1,
  },
  /** Orphan capture geriye-bakış (saat) — FLOW-M3. */
  ORPHAN_LOOKBACK_HOURS: {
    key: "PAYTR_ORPHAN_LOOKBACK_HOURS",
    default: 72,
    min: 1,
  },
  /**
   * Sipariş ödeme penceresi (saat): sipariş oluşunca `paymentExpiresAt` bu kadar
   * ileriye kurulur. Checkout (direct/grup/misafir), teklif kabulü ve
   * reaktivasyon AYNI değeri kullanır — eskiden 6 ayrı noktada 24 sabitti.
   */
  PAYMENT_WINDOW_HOURS: {
    key: "ORDER_PAYMENT_WINDOW_HOURS",
    default: 24,
    min: 1,
  },
} as const;

/** Env'den okuyabilen minimum yüzey (ConfigService veya test sahtesi). */
interface ConfigReader {
  get(key: string): string | undefined;
}

/**
 * Bir gün/sayı config'ini env'den okur; anahtar yoksa veya değer geçersizse
 * (boş/NaN/negatif ya da tanımlı `min` altındaysa) tanımdaki varsayılana düşer.
 * `configService.get(KEY) || "14"` kalıbı yerine BUNU kullan — varsayılan
 * yalnız PAYMENT_CONFIG_KEYS'te yaşasın. Pencere anahtarları `min: 1` taşır:
 * env'e 0 yazmak pencereyi ÇÖKERTEMEZ (takas ayarlarındaki `<1 → varsayılan`
 * guard'ının satış tarafındaki karşılığı; Escrow-Teknik invaryantı).
 */
export function resolvePaymentConfigNumber(
  configService: ConfigReader,
  spec: { key: string; default: number; min?: number },
): number {
  const raw = configService.get(spec.key);
  if (raw === undefined || raw === null || `${raw}`.trim() === "") {
    return spec.default;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < (spec.min ?? 0)) {
    return spec.default;
  }
  return Math.floor(parsed);
}

/** ConfigService enjekte edilmemiş yerler için aynı okuma (process.env üzerinden). */
export function envConfigNumber(spec: {
  key: string;
  default: number;
  min?: number;
}): number {
  return resolvePaymentConfigNumber({ get: (key) => process.env[key] }, spec);
}

/** Sipariş ödeme penceresinin bitişi: şimdi + PAYMENT_WINDOW_HOURS. */
export function paymentWindowEnd(from: Date = new Date()): Date {
  const hours = envConfigNumber(PAYMENT_CONFIG_KEYS.PAYMENT_WINDOW_HOURS);
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
