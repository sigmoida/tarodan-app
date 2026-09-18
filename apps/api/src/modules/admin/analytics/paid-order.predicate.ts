import { OrderOrigin, PaymentStatus, Prisma } from "@prisma/client";
import type { DashboardDateWindow } from "./dashboard-period.helper";

/**
 * "Ödenmiş sipariş" yüklemi — TEK tanım, iki dilde.
 *
 * İki şey aynı anda doğru olmalı:
 *
 * 1. Ödeme satırı siparişte OLMAYABİLİR. Grup sepetinde tek ödeme çekilir ve
 *    satır `Payment.checkoutGroupId` üzerinden durur; yalnız `Payment.orderId`
 *    sorulursa grup sepetiyle alınan her sipariş ciroda kaybolur.
 * 2. Sanal siparişler (üyelik, öne çıkarma) `origin = platform_service` ile
 *    DIŞARIDA kalır. Gelirleri kendi tablolarından raporlanır; GMV'ye
 *    karıştırılırsa aynı para iki kez sayılır.
 *
 * Dönem `Payment.paidAt`ten okunur — `status + createdAt`ten değil. Mart'ta
 * açılıp nisanda ödenen sipariş nisanın cirosudur.
 */

/** Prisma filtresi — tek kolonlu toplamalar ve sayımlar için. */
export function paidOrderWhere(
  window: DashboardDateWindow | undefined,
): Prisma.OrderWhereInput {
  const paid = { status: PaymentStatus.completed, paidAt: window };
  return {
    origin: { not: OrderOrigin.platform_service },
    OR: [
      { payment: { is: paid } },
      { checkoutGroup: { is: { payment: { is: paid } } } },
    ],
  };
}

/**
 * AYNI yüklemin SQL karşılığı, bir CTE olarak.
 *
 * Analitik ekranı zaman kovalarını SQL'de kesiyor (satırları belleğe çekip
 * gruplamak yasak), bu yüzden yüklemin bir de SQL yazımı gerekiyor. İkisi yan
 * yana duruyor ve ortak bir spec ikisini birden sabitliyor; ayrı dosyalara
 * dağılsalardı biri güncellenip diğeri unutulurdu.
 *
 * `JOIN LATERAL` iki ödeme yolunu TEK satıra indirir: `OR` ile yazılsaydı aynı
 * sipariş iki ödeme satırıyla eşleşip ciroyu ikiye katlayabilirdi.
 */
export function paidOrdersCte(window: DashboardDateWindow): Prisma.Sql {
  return Prisma.sql`
    paid_orders AS (
      SELECT
        o."id",
        o."seller_id",
        o."buyer_id",
        o."product_id",
        o."origin",
        o."total_amount",
        o."shipping_cost",
        o."discount_amount",
        o."platform_funded_discount",
        o."buyer_fee_discount_amount",
        o."seller_fee_discount_amount",
        paid."paid_at"
      FROM "orders" o
      ${paidAtLateral("o")}
      WHERE o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
        AND paid."paid_at" >= ${window.gte}
        AND paid."paid_at" <= ${window.lte}
    )
  `;
}

/**
 * Bir siparişin ÖDENME ANINI getiren lateral join — yukarıdaki CTE'nin de
 * kullandığı parça.
 *
 * Teslim süresi ölçümü ödenmiş siparişleri ödeme anına göre DEĞİL teslim anına
 * göre pencereler, yani CTE'yi olduğu gibi kullanamaz; yüklemin kalbi olan bu
 * lateral yine de tek yerde durur.
 *
 * @param alias Sorgudaki `orders` takma adı — çağıranların LİTERALİ, istekten
 *   türetilmiş hiçbir şey değil.
 */
export function paidAtLateral(alias: string): Prisma.Sql {
  const order = Prisma.raw(`"${alias}"`);
  return Prisma.sql`
    JOIN LATERAL (
      SELECT pay."paid_at"
      FROM "payments" pay
      WHERE pay."status" = ${PaymentStatus.completed}::"PaymentStatus"
        AND pay."paid_at" IS NOT NULL
        AND (
          pay."order_id" = ${order}."id"
          OR pay."checkout_group_id" = ${order}."checkout_group_id"
        )
      ORDER BY pay."paid_at" ASC
      LIMIT 1
    ) paid ON TRUE`;
}
