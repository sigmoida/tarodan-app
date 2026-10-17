import { ShipmentStatus, TradeStatus } from "@prisma/client";
import {
  resolveTimingValue,
  type TimingSettingReader,
} from "../timing-rules/timing-rules.resolver";

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
 * İki süre de Süreler ve Kurallar kaydındadır (`tradeHoldDays`,
 * `tradeConfirmationDays` — `@tarodan/types` TIMING_RULES): anahtar, varsayılan
 * ve admin sınırları orada tanımlıdır, okuma `common/timing-rules` üzerindendir.
 * Bir değer geçersizse (boş/NaN/1'den küçük) varsayılana düşer — hatalı bir
 * ayar yüzünden pencere sıfırlanıp para erken serbest kalmasın; admin ekranı da
 * en az 1 gün dayatır.
 */

/** Ayar okuyabilen minimum Prisma yüzeyi (PrismaService veya tx client). */
type SettingReader = TimingSettingReader;

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
  const days = await resolveTimingValue(db, "tradeHoldDays");
  return addDays(from, days);
}

/** Teslimat anı → onay/itiraz penceresinin biteceği an. */
export async function computeTradeConfirmationDeadline(
  db: SettingReader,
  from: Date = new Date(),
): Promise<Date> {
  const days = await resolveTimingValue(db, "tradeConfirmationDays");
  return addDays(from, days);
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
