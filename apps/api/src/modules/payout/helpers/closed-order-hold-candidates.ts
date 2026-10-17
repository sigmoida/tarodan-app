import { PaymentHoldStatus, Prisma } from "@prisma/client";
import { RESIDUAL_ORDER_STATUSES } from "./hold-release-eligibility";

/** Sayfalama imleci: son okunan adayın (createdAt, id) çifti. */
export interface HoldCandidateCursor {
  createdAt: Date;
  id: string;
}

export interface ClosedOrderHoldCandidate {
  id: string;
  createdAt: Date;
}

/**
 * İade/iptalle KAPANMIŞ (cancelled / refunded) siparişin hâlâ tutulan,
 * kilitsiz hold'ları — kalıntı yollarının TEK aday sorgusu. Saatlik bırakma
 * cron'u (kusur satıcıda değilse kalıntıyı satıcıya bırakır) ve kalıntı
 * kapatma (kusur satıcıdaysa platforma kapatır) aynı kümeden okur; karar
 * her ikisinde de `hold-release-eligibility` yüklemindedir.
 *
 * Neden sipariş durumundan: kalıntının tek güvenilir işareti siparişin
 * kapanmış olmasıdır. `refundedAmount > 0` değildir — bırakılacak pay hold'u
 * aşarsa iade hiç tüketmez ve kalıntı hold'un tamamı olur. `PaymentHold`'un
 * `order` ilişkisi olmadığı için parametreli JOIN.
 *
 * Sıralı ve sınırlı (§11); `after` ile (createdAt, id) üzerinden sayfalanır.
 * `undatedOnly`: yalnız `releaseAt`'siz hold'lar (tarihliler cron'un tarih
 * süzgecinden zaten geçer).
 */
export function closedOrderHeldHoldsQuery(opts: {
  limit: number;
  undatedOnly?: boolean;
  after?: HoldCandidateCursor;
}): Prisma.Sql {
  return Prisma.sql`
    SELECT h.id, h.created_at AS "createdAt"
    FROM payment_holds h
    JOIN orders o ON o.id = h.order_id
    WHERE h.status::text = ${PaymentHoldStatus.held}
      AND h.frozen_by_refund_id IS NULL
      ${opts.undatedOnly ? Prisma.sql`AND h.release_at IS NULL` : Prisma.empty}
      AND o.status::text IN (${Prisma.join([...RESIDUAL_ORDER_STATUSES])})
      ${
        opts.after
          ? Prisma.sql`AND (h.created_at, h.id) > (${opts.after.createdAt}, ${opts.after.id})`
          : Prisma.empty
      }
    ORDER BY h.created_at ASC, h.id ASC
    LIMIT ${opts.limit}
  `;
}

export function findClosedOrderHeldHolds(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  opts: Parameters<typeof closedOrderHeldHoldsQuery>[0],
): Promise<ClosedOrderHoldCandidate[]> {
  return db.$queryRaw<ClosedOrderHoldCandidate[]>(
    closedOrderHeldHoldsQuery(opts),
  );
}
