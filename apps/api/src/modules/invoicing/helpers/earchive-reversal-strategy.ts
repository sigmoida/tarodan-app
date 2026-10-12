import type { EArchiveReversalStrategy } from "../provider/e-invoice-provider";

/**
 * Kesilmiş e-Arşiv belgesinin İPTAL edilebildiği yasal pencere (gün).
 * Mevzuat kuralıdır, entegratöre özgü değildir — her sağlayıcı aynı sayıyı
 * kullanır.
 */
export const EARCHIVE_CANCELLATION_WINDOW_DAYS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * İade durumunda izlenecek yol (mevzuat): fatura tarihinden **≤8 gün** ise
 * e-Arşiv İPTAL, **>8 gün** ise iptal yapılamaz → İADE FATURASI (orijinali
 * referans veren yeni belge).
 *
 * TEK kaynak: eLogo (`ElogoService.refundStrategy`) ve Netsis adaptörü bu
 * fonksiyonu çağırır. Kural iki sağlayıcıda ayrı yazılsaydı biri değiştiğinde
 * aynı iade bir sağlayıcıda iptal, ötekinde iade faturası olurdu.
 */
export function eArchiveReversalStrategy(
  issuedAt: Date | string,
  now: Date = new Date(),
): EArchiveReversalStrategy {
  const issued = typeof issuedAt === "string" ? new Date(issuedAt) : issuedAt;
  const daysElapsed = Math.floor((now.getTime() - issued.getTime()) / DAY_MS);
  return daysElapsed <= EARCHIVE_CANCELLATION_WINDOW_DAYS
    ? "CANCEL"
    : "RETURN_INVOICE";
}
