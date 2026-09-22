import { CancellationActor, TradeStatus } from "@prisma/client";

/**
 * "Bir takası reddetmek" ne demek — TEK tanım.
 *
 * Takas hunisi (oluşturuldu → kabul → tamamlandı) çıkışları ayırt etmek
 * zorunda: ret, karşı tarafın "hayır" demesidir; iptal, anlaşmanın sonradan
 * bozulmasıdır. İkisi aynı `cancelledAt` damgasını paylaşıyordu, bu yüzden
 * dönemsel "reddedilen takas" ölçülemiyordu.
 *
 * Ret aynı zamanda bir iptaldir — para/stok akışı iptal yoluyla çözülür — bu
 * yüzden `cancelledAt` de yazılmaya devam eder. Analitik "iptal" çıkışını
 * `rejectedAt IS NULL` ile ayırır; aksi halde aynı takas iki kez sayılırdı.
 *
 * Aktör parametre değildir: reddi YALNIZ teklifin alıcısı (receiver = ilan
 * sahibi) yapabilir (`rejectTrade` yetki kapısı), bu yüzden hep `seller`.
 *
 * @param reason Ret gerekçesi (mevcut `cancelReason` alanına yazılır).
 * @param at Ret anı (aynı transaction içinde tek `now` paylaşmak için).
 */
export function tradeRejectedData(
  reason: string | null | undefined,
  at: Date = new Date(),
): {
  status: typeof TradeStatus.rejected;
  cancelReason: string | null;
  rejectedAt: Date;
  cancelledAt: Date;
  cancelledBy: typeof CancellationActor.seller;
} {
  return {
    status: TradeStatus.rejected,
    cancelReason: reason ?? null,
    rejectedAt: at,
    cancelledAt: at,
    cancelledBy: CancellationActor.seller,
  };
}
