import { PayoutStatus, Prisma } from "@prisma/client";
import type { DashboardDateWindow } from "./dashboard-period.helper";

/**
 * "Kullanıcılara ödenen hak ediş" yüklemi — TEK tanım, iki dilde.
 *
 * `PayoutTransfer` satıcı escrow hak edişini (`paymentHoldId`) VE takas nakit
 * hak edişini (`tradeCashPaymentId`) aynı tabloda taşır, bu yüzden tek bir
 * `status + processedAt` filtresi ikisini de kapsar — ayrı sorguya gerek yok.
 *
 * Dönem `processedAt`ten okunur: PayTR'ye talimatın GÖNDERİLDİĞİ/onaylandığı
 * an, `createdAt`ten (talep oluşturma anı) değil.
 */

/** Prisma filtresi — sayım için. */
export function completedPayoutWhere(
  window: DashboardDateWindow | undefined,
): Prisma.PayoutTransferWhereInput {
  return {
    status: PayoutStatus.completed,
    processedAt: window ?? { not: null },
  };
}

/**
 * AYNI yüklemin ham SQL karşılığı — tutar için.
 *
 * Gerçekten gönderilen tutar `submittedAmount`tir: PayTR'ye aşama-1 kabulünde
 * donan snapshot (bkz. `payout.service.ts`, satır ~958-977). `netAmount`
 * sonradan bir adjustment/iade ile değişebilir, `submittedAmount` değişmez.
 * Eski/sıfır-tutarlı kayıtlarda (tam mahsup, hiç transfer edilmemiş) alan
 * boş kalır — o satırlarda gönderilen zaten `netAmount` (genelde 0) kadardır.
 *
 * Prisma `_sum` TEK kolonu toplar; burada satır satır İKİ kolon arasında
 * seçim (`COALESCE`) gerektiği için aggregate API yeterli değil, ham SQL.
 */
export function completedPayoutAmountSql(
  window: DashboardDateWindow | undefined,
): Prisma.Sql {
  const stamp = window
    ? Prisma.sql`pt."processed_at" BETWEEN ${window.gte} AND ${window.lte}`
    : Prisma.sql`pt."processed_at" IS NOT NULL`;

  return Prisma.sql`
    SELECT COALESCE(SUM(COALESCE(pt."submitted_amount", pt."net_amount")), 0) AS total
    FROM "payout_transfers" pt
    WHERE pt."status" = ${PayoutStatus.completed}::"PayoutStatus"
      AND ${stamp}
  `;
}
