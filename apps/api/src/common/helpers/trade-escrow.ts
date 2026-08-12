import { ShipmentStatus, TradeStatus } from "@prisma/client";

/**
 * TAKAS ESCROW ZAMANLAMASI — TEK KAYNAK.
 *
 * Takas parası iki pencereden geçer:
 *   1) ONAY penceresi  : koliler TESLİM EDİLDİKTEN sonra taraflara tanınan
 *      onay/itiraz süresi. Dolunca takas otomatik tamamlanır
 *      (autoConfirmExpiredReceipts).
 *   2) HOLD penceresi   : takas tamamlandıktan sonra nakit farkın karşı tarafa
 *      açılması için beklenen süre (holdReleaseAt → releaseHoldsDue cron).
 *
 * Saat TESLİMATTAN başlar, kargoya verilişten değil: aksi halde yavaş kargoda
 * takas koli daha yoldayken otomatik tamamlanıp para serbest kalıyordu ve
 * kullanıcı `completed` statüde artık itiraz da açamıyordu. Sipariş tarafındaki
 * escrow da (teslim + iade penceresi + grace) aynı ilkeyi izler.
 *
 * İki süre de PlatformSetting'ten okunur (deploy'suz ayarlanabilir); anahtar ve
 * varsayılanlar YALNIZ burada tanımlıdır — kod, seed ve admin paneli hep bu
 * dosyadaki değerlere dayanır.
 */
export const TRADE_ESCROW_SETTINGS = {
  /** Takas tamamlandıktan sonra nakit hold'un açılma süresi (gün). */
  HOLD_DAYS: { key: "payment_hold_days", default: 3 },
  /** Teslimattan sonra tarafların onay/itiraz penceresi (gün). */
  CONFIRMATION_DAYS: { key: "trade_confirmation_deadline_days", default: 3 },
} as const;

type TradeEscrowSetting =
  (typeof TRADE_ESCROW_SETTINGS)[keyof typeof TRADE_ESCROW_SETTINGS];

/** Ayar okuyabilen minimum Prisma yüzeyi (PrismaService veya tx client). */
interface SettingReader {
  platformSetting: {
    findUnique(args: {
      where: { settingKey: string };
    }): Promise<{ settingValue: string } | null>;
  };
}

/**
 * Teslim edilmemiş TERMİNAL çıkış bacakları (iptal/dönüş). Böyle bir bacak
 * pencereyi BLOKLAR — hesap dışı bırakılmaz: dönen koliyi yok sayıp kalan
 * bacağın teslimiyle pencereyi açmak, o tarafın hiç almadığı takası otomatik
 * tamamlayıp parayı serbest bırakırdı. Bu durum admin alarmına düşer ve
 * itiraz/tazminat yollarıyla çözülür.
 */
const TERMINAL_NON_DELIVERED_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.cancelled,
  ShipmentStatus.returned,
];

/**
 * Ayardaki gün sayısı. Satır yoksa ya da değer geçersizse (boş/NaN/1'den
 * küçük) varsayılana düşer — hatalı bir ayar yüzünden pencere sıfırlanıp para
 * erken serbest kalmasın. 0 da reddedilir: sıfır gün, hold'u tamamlanma anında
 * çökertip parayı beklemesiz açar (admin paneli de min 1 dayatır).
 */
export async function resolveTradeEscrowDays(
  db: SettingReader,
  setting: TradeEscrowSetting,
): Promise<number> {
  const row = await db.platformSetting.findUnique({
    where: { settingKey: setting.key },
  });
  const raw = row?.settingValue;
  // Boş dize Number("") === 0 verir: ayar boş bırakıldığında pencere sıfırlanıp
  // para anında serbest kalmasın diye "yok" sayılır.
  if (raw === undefined || raw === null || `${raw}`.trim() === "") {
    return setting.default;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return setting.default;
  return Math.floor(parsed);
}

export function addDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

/** Takas tamamlandı → nakit hold'un serbest kalacağı an. */
export async function computeTradeHoldReleaseAt(
  db: SettingReader,
  from: Date = new Date(),
): Promise<Date> {
  const days = await resolveTradeEscrowDays(
    db,
    TRADE_ESCROW_SETTINGS.HOLD_DAYS,
  );
  return addDays(from, days);
}

/** Teslimat anı → onay/itiraz penceresinin biteceği an. */
export async function computeTradeConfirmationDeadline(
  db: SettingReader,
  from: Date = new Date(),
): Promise<Date> {
  const days = await resolveTradeEscrowDays(
    db,
    TRADE_ESCROW_SETTINGS.CONFIRMATION_DAYS,
  );
  return addDays(from, days);
}

/**
 * Kayıp koli bekleme süresi (gün) — hem depoya varmayan giriş bacağının
 * otomatik çözümünde hem de teslim raporu hiç gelmeyen çıkış bacağının admin
 * alarmında kullanılır.
 */
export function tradeLostParcelGraceDays(): number {
  const parsed = Number(process.env.TRADE_LOST_PARCEL_GRACE_DAYS ?? 14);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 14;
}

/** startTradeConfirmationWindowIfDelivered için gereken Prisma yüzeyi. */
interface ConfirmationWindowClient extends SettingReader {
  trade: {
    findUnique(args: {
      where: { id: string };
      select: { status: true; confirmationDeadline: true };
    }): Promise<{
      status: TradeStatus;
      confirmationDeadline: Date | null;
    } | null>;
    updateMany(args: {
      where: {
        id: string;
        status: TradeStatus;
        confirmationDeadline: null;
      };
      data: { confirmationDeadline: Date };
    }): Promise<{ count: number }>;
  };
  tradeShipment: {
    findMany(args: {
      where: { tradeId: string; leg: string };
      select: { deliveredAt: true; status: true };
    }): Promise<Array<{ deliveredAt: Date | null; status: ShipmentStatus }>>;
  };
}

/**
 * Çıkış kolilerinin HEPSİ teslim edildiyse onay/itiraz penceresini başlatır.
 * İki teslim yolundan da (Sürat poll'u ve kullanıcının elle onayı) çağrılır;
 * idempotenttir: pencere zaten kuruluysa ya da tek koli bile teslim
 * edilmediyse hiçbir şey yazmaz.
 *
 * Yazma koşullu-atomiktir (`confirmationDeadline: null` WHERE içinde) — iki
 * teslim aynı anda işlenirse pencere ikinci kez ötelenmez.
 *
 * @returns kurulan son tarih, yoksa null.
 */
export async function startTradeConfirmationWindowIfDelivered(
  db: ConfirmationWindowClient,
  tradeId: string,
): Promise<Date | null> {
  const trade = await db.trade.findUnique({
    where: { id: tradeId },
    select: { status: true, confirmationDeadline: true },
  });
  if (
    !trade ||
    trade.status !== TradeStatus.shipping_to_recipients ||
    trade.confirmationDeadline
  ) {
    return null;
  }

  const legs = await db.tradeShipment.findMany({
    where: { tradeId, leg: "from_warehouse" },
    select: { deliveredAt: true, status: true },
  });
  if (legs.length === 0) return null;
  // İptal/dönüş bacağı pencereyi BLOKLAR (yukarıdaki sabitin gerekçesi).
  if (
    legs.some((leg) => TERMINAL_NON_DELIVERED_STATUSES.includes(leg.status))
  ) {
    return null;
  }
  if (legs.some((leg) => !leg.deliveredAt)) return null;

  const lastDeliveredAt = legs.reduce<Date>(
    (latest, leg) =>
      leg.deliveredAt && leg.deliveredAt > latest ? leg.deliveredAt : latest,
    legs[0].deliveredAt as Date,
  );
  const confirmationDeadline = await computeTradeConfirmationDeadline(
    db,
    lastDeliveredAt,
  );

  const updated = await db.trade.updateMany({
    where: {
      id: tradeId,
      status: TradeStatus.shipping_to_recipients,
      confirmationDeadline: null,
    },
    data: { confirmationDeadline },
  });
  return updated.count > 0 ? confirmationDeadline : null;
}
