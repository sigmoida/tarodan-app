import {
  CancellationActor,
  PaymentStatus,
  Prisma,
  RefundAttemptStatus,
} from "@prisma/client";
import type {
  AdminCancellationInfo,
  AdminCancellationReason,
  AdminCancellationRefundState,
  AdminCancellationRow,
  AdminOrderLine,
  AdminOrderPackage,
  AdminOrderParty,
} from "@tarodan/types";
import { isOrderExpiryCancelReason } from "../../../order/helpers/order-cancel-reasons";
import { isTradeExpiryCancelReason } from "../../../trade/helpers/trade-cancel-reasons";
import type {
  CancellationLine,
  CancellationTrade,
} from "./cancellation-select";
import {
  mapCartRow,
  type CartHead,
  type RowMapContext,
} from "./order-list-row.mapper";
import { PAID_PAYMENT_STATUSES } from "./cancellation-where";

/**
 * İptaller sekmesinin satır eşlemesi — saf. Sipariş satırları siparişler
 * ekranının `mapCartRow`'unu yeniden kullanır (aynı paket / kalem / komisyon
 * sözleşmesi); bu dosya yalnız iptalin kendi alanlarını (neden, aktör, iade
 * durumu) ve takas satırını ekler.
 */

const money = (value: Prisma.Decimal | number | null | undefined) =>
  new Prisma.Decimal(value ?? 0);

const nonEmpty = (value: string | null | undefined): string | null =>
  value?.trim() ? value.trim() : null;

/**
 * Sipariş iptalinin görünen nedeni.
 * 1. Alıcının kendi iptali + seçtiği kod → kodun etiketi.
 * 2. Süre dolumu sabiti → "Süresi Dolan" (alıcının açık bir iptal talebi
 *    varken sistem süre dolumuyla kapattıysa kod bayattır; süre dolumu kazanır).
 * 3. Aktörü bilinmeyen eski kayıtta kod → kodun etiketi.
 * 4. Serbest metin → metnin kendisi; hiçbiri yoksa boş.
 */
export function orderCancellationReason(order: {
  cancelledBy: CancellationActor | null;
  cancellationReasonCode: string | null;
  cancelReason: string | null;
}): AdminCancellationReason {
  const code = order.cancellationReasonCode;
  if (code && order.cancelledBy === CancellationActor.buyer)
    return { kind: "code", code };
  if (isOrderExpiryCancelReason(order.cancelReason)) return { kind: "expired" };
  if (code) return { kind: "code", code };
  const text = nonEmpty(order.cancelReason);
  return text ? { kind: "text", text } : { kind: "none" };
}

/** Takas iptalinin nedeni: takasta alıcı kodu yok; süre dolumu ya da metin. */
export function tradeCancellationReason(trade: {
  cancelReason: string | null;
}): AdminCancellationReason {
  if (isTradeExpiryCancelReason(trade.cancelReason)) return { kind: "expired" };
  const text = nonEmpty(trade.cancelReason);
  return text ? { kind: "text", text } : { kind: "none" };
}

const REFUND_DONE: RefundAttemptStatus[] = [
  RefundAttemptStatus.succeeded,
  RefundAttemptStatus.finalized,
];
const REFUND_BROKEN: RefundAttemptStatus[] = [
  RefundAttemptStatus.failed,
  RefundAttemptStatus.manual_review,
];

/**
 * Sipariş kaleminin iade durumu. Tahsilat siparişin ya da (sepette) grubunun
 * ödemesidir. Başarılı bir iade denemesi "iade edildi"dir; açık bir iade talebi
 * "incelemede"; yalnız başarısız denemeler "başarısız"; tahsil edilmiş ama hiç
 * denenmemiş "bekliyor".
 */
export function orderRefundState(line: {
  payment: { status: PaymentStatus } | null;
  checkoutGroup: { payment: { status: PaymentStatus } | null } | null;
  refundAttempts: readonly { status: RefundAttemptStatus }[];
  refundRequests: readonly unknown[];
}): AdminCancellationRefundState {
  const paymentStatus =
    line.payment?.status ?? line.checkoutGroup?.payment?.status ?? null;
  if (!paymentStatus || !PAID_PAYMENT_STATUSES.includes(paymentStatus))
    return "not_charged";
  const attempts = line.refundAttempts.map((attempt) => attempt.status);
  if (attempts.some((status) => REFUND_DONE.includes(status)))
    return "refunded";
  if (line.refundRequests.length > 0) return "in_review";
  if (attempts.some((status) => REFUND_BROKEN.includes(status)))
    return "failed";
  return "pending";
}

/** Takasın iade durumu: tahsil edilen nakit ödemelerinin iadesi. */
export function tradeRefundState(trade: {
  refundFailureAt: Date | null;
  cashPayments: readonly {
    status: PaymentStatus;
    refundedAt: Date | null;
  }[];
}): AdminCancellationRefundState {
  const paid = trade.cashPayments.filter((payment) =>
    PAID_PAYMENT_STATUSES.includes(payment.status),
  );
  if (paid.length === 0) return "not_charged";
  const refunded = paid.filter(
    (payment) =>
      payment.refundedAt !== null || payment.status === PaymentStatus.refunded,
  );
  if (refunded.length === paid.length) return "refunded";
  if (trade.refundFailureAt) return "failed";
  return refunded.length > 0 ? "refunded" : "pending";
}

function orderInfoOf(line: CancellationLine): AdminCancellationInfo {
  return {
    cancelledAt: line.cancelledAt?.toISOString() ?? null,
    cancelledBy: line.cancelledBy ?? null,
    reason: orderCancellationReason(line),
    refundState: orderRefundState(line),
  };
}

/** Kalemlerin en geç iptal anı; hiçbiri damgalı değilse null. */
function latest(dates: readonly (string | null)[]): string | null {
  return dates.reduce<string | null>(
    (acc, value) => (value && (!acc || value > acc) ? value : acc),
    null,
  );
}

function uniqueParties(parties: readonly AdminOrderParty[]): AdminOrderParty[] {
  const seen = new Set<string>();
  return parties.filter((party) => {
    if (seen.has(party.id)) return false;
    seen.add(party.id);
    return true;
  });
}

/**
 * Sepet (GRP) ya da grupsuz sipariş (ORD) satırı — yalnız verilen (iptal)
 * kalemlerle. `totalLines` satırın bütün kalem sayısıdır (kısmi iptal).
 */
export function mapCancelledCartRow(
  head: CartHead,
  lines: readonly CancellationLine[],
  totalLines: number,
  ctx: RowMapContext,
): AdminCancellationRow {
  const row = mapCartRow(head, lines, ctx);
  const cancellations = Object.fromEntries(
    lines.map((line) => [line.id, orderInfoOf(line)]),
  );
  const statuses = [...new Set(lines.map((line) => line.status))];
  return {
    kind: head.kind,
    id: head.id,
    number: head.number,
    origin: row.origin === "offer" ? "offer" : "direct_sale",
    createdAt: row.createdAt,
    status: statuses.length === 1 ? statuses[0] : "mixed",
    detailOrderId: row.detailOrderId,
    tradeId: null,
    isTest: row.isTest,
    buyer: row.buyer,
    sellers: uniqueParties(row.packages.map((pkg) => pkg.seller)),
    totalAmount: row.totalAmount,
    subtotal: row.subtotal,
    fees: row.fees,
    offer: row.offer,
    packages: row.packages,
    lineCounts: {
      cancelled: lines.length,
      total: Math.max(totalLines, lines.length),
    },
    cancelledAt: latest(
      Object.values(cancellations).map((info) => info.cancelledAt),
    ),
    cancellations,
  };
}

function tradePartyOf(user: CancellationTrade["initiator"]): AdminOrderParty {
  return {
    id: user.id,
    displayName: user.displayName ?? "",
    email: user.email ?? null,
    code: user.adminCode ?? null,
    isGuest: false,
  };
}

/**
 * Takas satırı. Paket = ürünün sahibi olan taraf (teklifi açan / ilan sahibi),
 * kalem = takas ürünü; birim fiyat takas anındaki değerdir. Komisyon tahsil
 * edilen nakit ödemelerinden: v1 komisyonu satış komisyonu, v2 hizmet bedeli
 * platform kesintisidir.
 */
export function mapCancelledTradeRow(
  trade: CancellationTrade,
  ctx: RowMapContext,
): AdminCancellationRow {
  const initiator = tradePartyOf(trade.initiator);
  const receiver = tradePartyOf(trade.receiver);
  const info: AdminCancellationInfo = {
    cancelledAt: trade.cancelledAt?.toISOString() ?? null,
    cancelledBy: trade.cancelledBy ?? null,
    reason: tradeCancellationReason(trade),
    refundState: tradeRefundState(trade),
  };

  const lineOf = (item: CancellationTrade["items"][number]): AdminOrderLine => {
    const quantity = item.quantity > 0 ? item.quantity : 1;
    const subtotal = money(item.valueAtTrade).times(quantity);
    return {
      orderId: item.id,
      orderNumber: trade.tradeNumber,
      // Kalem bir sipariş değildir; iptal/ret ayrımı satırın `status`'unda.
      status: "cancelled",
      cancellationType: null,
      cancelledBy: trade.cancelledBy ?? null,
      quantity,
      unitPrice: money(item.valueAtTrade).toNumber(),
      subtotal: subtotal.toNumber(),
      totalAmount: subtotal.toNumber(),
      preparingDeadline: null,
      deliveredAt: null,
      hasActiveRefund: false,
      product: {
        id: item.product.id,
        title: item.product.title,
        productCode: item.product.productCode ?? null,
        modelCode: item.product.modelCode ?? null,
        brandName: item.product.brand?.name ?? null,
        imageUrl: ctx.imageUrl(item.product.images[0]?.cardKey),
      },
    };
  };

  const packages: AdminOrderPackage[] = (
    [
      ["initiator", initiator],
      ["receiver", receiver],
    ] as const
  ).flatMap(([side, owner]) => {
    const items = trade.items.filter((item) => item.side === side);
    return items.length
      ? [
          {
            key: `${trade.id}:${side}`,
            packageNumber: null,
            seller: owner,
            shipment: null,
            invoices: [],
            lines: items.map(lineOf),
          },
        ]
      : [];
  });

  const paid = trade.cashPayments.filter((payment) =>
    PAID_PAYMENT_STATUSES.includes(payment.status),
  );
  const sum = (pick: (payment: (typeof paid)[number]) => Prisma.Decimal) =>
    paid.reduce((acc, payment) => acc.plus(pick(payment)), money(0));
  const subtotal = packages
    .flatMap((pkg) => pkg.lines)
    .reduce((acc, line) => acc.plus(line.subtotal), money(0));

  return {
    kind: "trade",
    id: trade.id,
    number: trade.tradeNumber,
    origin: "trade",
    createdAt: trade.createdAt.toISOString(),
    status: trade.status,
    detailOrderId: null,
    tradeId: trade.id,
    isTest: trade.isTest,
    buyer: initiator,
    sellers: [receiver],
    totalAmount: sum((payment) => money(payment.totalAmount)).toNumber(),
    subtotal: subtotal.toNumber(),
    fees: {
      salesCommission: sum((payment) => money(payment.commission)).toNumber(),
      platformFee: sum((payment) => money(payment.tradeFeeAmount)).toNumber(),
    },
    offer: null,
    packages,
    lineCounts: { cancelled: trade.items.length, total: trade.items.length },
    cancelledAt: info.cancelledAt,
    cancellations: Object.fromEntries(
      trade.items.map((item) => [item.id, info]),
    ),
  };
}
