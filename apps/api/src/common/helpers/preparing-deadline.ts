import { OrderStatus, type Prisma } from "@prisma/client";
import type { TimingExpiryAction } from "@tarodan/types";
import { TR_TIME_ZONE } from "./tr-calendar";

/**
 * Satıcının kargoya verme son tarihi TAKVİM günü değil, PAZAR HARİÇ gün
 * sayılarak hesaplanır: Türkiye'de kargo pazar günü çalışmaz; cuma günü ödenen
 * siparişin 3 günlük süresi pazar yüzünden fiilen 2 güne inmesin. Sayaç pazar
 * günlerini atlar — sonuç tarih hiçbir zaman pazara denk gelmez.
 */
export function addDaysSkippingSundays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0) remaining--;
  }
  return result;
}

/**
 * "Hazırlık son tarihi yaklaşıyor" kümesi: hazırlanan ve son tarihi şimdiden
 * SONRA, en geç `leadHours` saat içinde dolacak siparişler.
 *
 * TEK tanım: satıcı uyarısı (`handleExpiredPreparingOrders`, faz 1) ile
 * dashboard'un `preparingDeadlineApproaching` uyarısı aynı süreyi (Süreler ve
 * Kurallar → `preparingWarningLeadHours`) ve aynı sınırları okur. Panelin
 * "N saat içinde doluyor" dediği küme ile satıcıya uyarı giden küme ayrışamaz.
 */
export function preparingDeadlineApproachingWhere(
  now: Date,
  leadHours: number,
): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.preparing,
    preparingDeadline: {
      gt: now,
      lte: new Date(now.getTime() + leadHours * 60 * 60 * 1000),
    },
  };
}

/**
 * Son tarih gerçekten geçti mi — süre dolumu sorgusunun (`lt: now`) kilit
 * altındaki tekrarı. Arada sipariş uzatılmışsa son tarih ileri gitmiştir ve
 * bu tur siparişe dokunmamalıdır.
 */
export function isPreparingDeadlinePassed(
  deadline: Date | null,
  now: Date,
): boolean {
  return deadline !== null && deadline.getTime() < now.getTime();
}

/**
 * Süresi dolan siparişe bu turda tek seferlik uzatma uygulanır mı: admin
 * `extend_once` seçmişse VE sipariş daha önce hiç uzatılmamışsa. Varsayılan
 * eylemde ve ikinci dolumda iptal + iade çalışır.
 */
export function shouldExtendPreparingDeadline(
  action: TimingExpiryAction,
  order: { preparingExtendedAt: Date | null },
): boolean {
  return action === "extend_once" && order.preparingExtendedAt === null;
}

/**
 * Uzatılmış son tarih: uzatmanın verildiği andan itibaren TAM bir hazırlık
 * süresi, ilk damgayla aynı pazar-hariç kuralıyla. Eski son tarihten değil
 * şimdiden sayılır: cron gecikirse satıcıya tanınan ek süre kısalmasın, eski
 * son tarih çok gerideyse uzatma geçmişe düşmesin.
 */
export function extendedPreparingDeadline(
  now: Date,
  preparingDays: number,
): Date {
  return addDaysSkippingSundays(now, preparingDays);
}

/**
 * Bildirim metnindeki son tarih ("8 Ekim 2026 00:30"): uyarı ve uzatma
 * bildirimleri aynı biçimi kullanır.
 *
 * Saat dilimi AÇIKÇA Europe/Istanbul'dur (`TR_TIME_ZONE`, tr-calendar):
 * süreç saat dilimiyle biçimlendirildiğinde UTC koşan konteynerde (projede
 * `TZ` tanımlı değil) alıcı ve satıcıya giden son tarih üç saat erken
 * okunuyor, web/admin ekranlarındaki tarihle çelişiyordu.
 */
const PREPARING_DEADLINE_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TR_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Son tarih Türkiye saatiyle; tarih yoksa boş metin. */
export function formatPreparingDeadline(deadline: Date | null): string {
  return deadline ? PREPARING_DEADLINE_FORMAT.format(deadline) : "";
}
