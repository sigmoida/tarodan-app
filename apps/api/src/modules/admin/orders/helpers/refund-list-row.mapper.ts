import { Prisma } from "@prisma/client";
import {
  ADMIN_REFUND_TRADE_ROLES,
  TRADE_REFUND_CLOSED_STATUSES,
  refundAttemptMoneyStatus,
  refundRequestKindOf,
  type AdminOrderParty,
  type AdminRefundMoneyStatus,
  type AdminRefundParty,
  type AdminRefundRow,
  type AdminRefundTradeRole,
  type AdminRefundWarehouseDecision,
  type RefundAttemptStatusValue,
} from "@tarodan/types";
import { compareOfferToListing } from "../../../order/helpers/order-offer-snapshot";
import {
  refundComponentTotals,
  refundedSalesCommissionNet,
} from "../../../refund/helpers/refund-component-totals";
import {
  refundedServiceFeeOf,
  tradePaymentRefundableAmountFor,
  tradeServiceFeeOf,
  type RefundablePayment,
} from "../../../trade/helpers/trade-refund-policy";
import { isTradeHandedToCargo } from "../../../trade/helpers/trade-handed-to-cargo";
import { buyerOf, partyOf, salesCommissionOf } from "./order-list-row.mapper";
import {
  TRADE_REFUND_CHARGED_PAYMENT_STATUSES,
  tradeRefundKindOf,
} from "./refund-list-where";
import type {
  RefundRowAttempt,
  RefundRowInvoice,
  RefundRowPayload,
  TradeRefundPayload,
} from "./refund-list-select";

/**
 * Admin İadeler listesinin satır eşlemesi — Prisma yükünden `@tarodan/types`
 * `AdminRefundRow`'a. Saf: deneme ve iade faturası dışarıdan verilir.
 *
 * Para hiçbir yerde yeniden HESAPLANMAZ; kesinleşmiş kayıtlar okunur:
 * talepte bileşen satırları (`RefundFinancialComponent`) + siparişin komisyon
 * kolonları, takasta ödeme satırı (`TradeCashPayment`) + takas iade politikası
 * (`trade-refund-policy`, PayTR iadesiyle aynı fonksiyon). `Decimal` → sayı
 * yalnız burada (sınırda).
 */

const money = (value: Prisma.Decimal.Value | null | undefined) =>
  new Prisma.Decimal(value ?? 0);

const toMoney = (value: Prisma.Decimal) => value.toDecimalPlaces(2).toNumber();

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

function refundParty(party: AdminOrderParty): AdminRefundParty {
  return { id: party.id, name: party.displayName, code: party.code };
}

/** Etkin oran (%) = tutar ÷ taban × 100, iki hane; taban yoksa null. */
export function ratePercent(
  amount: Prisma.Decimal,
  base: Prisma.Decimal,
): number | null {
  if (base.lte(0)) return null;
  return amount.dividedBy(base).times(100).toDecimalPlaces(2).toNumber();
}

const trackingOf = (
  shipment:
    | { providerTrackingId: string | null; trackingNumber: string | null }
    | null
    | undefined,
): string | null =>
  shipment?.providerTrackingId ?? shipment?.trackingNumber ?? null;

// ── İade talebi ──────────────────────────────────────────────────────────────

/** Talebin para durumu: kesinleşme > deneme > kapanış > bekliyor. */
export function refundRequestMoneyStatus(
  request: { status: string; refundedAt: Date | null },
  attemptStatus: RefundAttemptStatusValue | null,
): AdminRefundMoneyStatus {
  if (request.refundedAt || request.status === "refunded") return "refunded";
  if (attemptStatus) return refundAttemptMoneyStatus(attemptStatus);
  if (request.status === "rejected" || request.status === "cancelled") {
    return "none";
  }
  return "pending";
}

/** Sonuçlanma anı: iade anı, ya da ret / kapanış kararının anı. */
function requestCompletedAt(request: RefundRowPayload): string | null {
  if (request.status === "refunded") return iso(request.refundedAt);
  if (request.status === "rejected" || request.status === "cancelled") {
    return iso(request.decidedAt ?? request.updatedAt);
  }
  return null;
}

export interface RefundRowContext {
  /** Talebin (tek) iade denemesi; yoksa null. */
  attempt: RefundRowAttempt | null;
  /** Bu denemeyle kesilmiş iade faturası; yoksa null. */
  returnInvoice: RefundRowInvoice | null;
}

const invoiceRef = (invoice: RefundRowInvoice | null | undefined) =>
  invoice
    ? { id: invoice.id, number: invoice.invoiceNumber, status: invoice.status }
    : null;

/**
 * İade talebi satırı (direkt satış ya da teklif).
 *
 * - Komisyon = satış komisyonu (satıcı + alıcı, KDV hariç) — sipariş
 *   listesindeki tanım; oran etkin orandır (komisyon ÷ ürün tabanı).
 * - İade edilecek komisyon = bileşenlerde sahibine dönen satış komisyonu;
 *   oranı iade edilen ürün tabanına (birim × iade adedi) göredir.
 * - Kesintiler = `buyer_charge` / `seller_charge` toplamları.
 * - Teklifte ilan fiyatının komisyonu, teklifin ETKİN oranıyla ilan fiyatına
 *   uygulanır (ilan fiyatından komisyon hiç hesaplanmadı; min/maks sınırları
 *   yansımaz — bkz. docs/REFUNDS_SCREEN.md).
 */
export function mapRefundRequestRow(
  request: RefundRowPayload,
  ctx: RefundRowContext,
): AdminRefundRow {
  const { order } = request;
  const quantity = order.quantity > 0 ? order.quantity : 1;
  const subtotal =
    order.subtotal != null
      ? money(order.subtotal)
      : money(order.unitPrice).times(quantity);
  const unitPrice =
    order.unitPrice != null
      ? money(order.unitPrice)
      : subtotal.dividedBy(quantity);
  const commission = salesCommissionOf(order);
  const refundedCommission = money(
    refundedSalesCommissionNet(request.financialComponents),
  );
  const totals = refundComponentTotals(request.financialComponents);
  const isOffer = order.origin === "offer";

  const offer = isOffer
    ? compareOfferToListing({
        financialSnapshot: order.financialSnapshot,
        currentListingPrice:
          order.product.price != null ? Number(order.product.price) : null,
        offerAmount: toMoney(money(order.offer?.amount ?? unitPrice)),
      })
    : null;
  const listingCommission =
    offer?.listingPrice != null && subtotal.gt(0)
      ? toMoney(
          money(offer.listingPrice)
            .times(quantity)
            .times(commission)
            .dividedBy(subtotal),
        )
      : null;

  const attemptStatus = ctx.attempt?.status ?? null;
  const hasReturnLeg =
    request.returnStatus != null ||
    request.returnTrackingNumber != null ||
    request.returnProviderTrackingId != null;

  return {
    id: request.id,
    refundNo: request.refundNumber,
    createdAt: request.createdAt.toISOString(),
    kind: refundRequestKindOf(request.policyCode),
    origin: isOffer ? "offer" : "direct",
    isTest: order.isTest,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      groupNumber: order.checkoutGroup?.groupNumber ?? null,
      packageTrackingNo: trackingOf(order.shipment),
    },
    buyer: refundParty(buyerOf(order.buyer, order.shippingAddress)),
    seller: refundParty(partyOf(order.seller)),
    product: {
      id: order.product.id,
      title: order.product.title,
      productCode: order.product.productCode ?? null,
      quantity,
      refundQuantity: request.refundQuantity,
    },
    money: {
      unitPrice: toMoney(unitPrice),
      commissionRate: ratePercent(commission, subtotal),
      commissionAmount: toMoney(commission),
      refundableCommissionRate: ratePercent(
        refundedCommission,
        unitPrice.times(request.refundQuantity),
      ),
      refundableCommissionAmount: toMoney(refundedCommission),
      listingCommissionAmount: isOffer ? listingCommission : null,
      offerCommissionAmount: isOffer ? toMoney(commission) : null,
      priceDifference: offer?.difference ?? null,
      buyerDeduction: totals.buyerCharge,
      sellerDeduction: totals.sellerCharge,
      refundAmount: toMoney(money(request.amount)),
      status: refundRequestMoneyStatus(request, attemptStatus),
      refundedAt: iso(request.refundedAt),
    },
    returnShipment: hasReturnLeg
      ? {
          trackingNo:
            request.returnProviderTrackingId ??
            request.returnTrackingNumber ??
            null,
          status: request.returnStatus ?? null,
        }
      : null,
    warehouse: null,
    reason: {
      code: request.resolvedReason ?? request.reason,
      label: null,
      note: request.description ?? null,
    },
    status: request.status,
    completedAt: requestCompletedAt(request),
    returnInvoice: invoiceRef(ctx.returnInvoice),
    trade: null,
  };
}

// ── Takas ────────────────────────────────────────────────────────────────────

/** Takas tarafı satırının anahtarı ve türetilmiş iade numarasının eki. */
export const TRADE_REFUND_ROLE_SUFFIX = {
  initiator: "INI",
  responder: "REC",
} as const satisfies Record<AdminRefundTradeRole, string>;

export function tradeRefundRowId(
  tradeId: string,
  role: AdminRefundTradeRole,
): string {
  return `${tradeId}:${role}`;
}

export interface TradeRefundRowContext {
  /** `TradeCashPayment.id` → o satırın hizmet/kargo belgesinin iade faturası. */
  returnInvoiceByCashPayment: ReadonlyMap<string, RefundRowInvoice>;
}

type CashPayment = TradeRefundPayload["cashPayments"][number];

function policyPaymentOf(payment: CashPayment): RefundablePayment {
  return {
    totalAmount: payment.totalAmount,
    shippingAmount: payment.shippingAmount,
    tradeFeeAmount: payment.tradeFeeAmount,
    commissionAmount: payment.commission,
    commissionTaxAmount: payment.commissionTaxAmount,
    fullRefundEntitled: payment.fullRefundEntitled,
  };
}

/** Tarafın para durumu: tahsilat > kesinleşme > deneme > hata işareti > bakiye. */
export function tradeSideMoneyStatus(side: {
  charged: boolean;
  refundedAt: Date | null;
  attemptStatus: RefundAttemptStatusValue | null;
  refundFailed: boolean;
  expected: number;
}): AdminRefundMoneyStatus {
  if (!side.charged) return "none";
  if (side.refundedAt) return "refunded";
  if (side.attemptStatus) return refundAttemptMoneyStatus(side.attemptStatus);
  if (side.expected <= 0) return "none";
  return side.refundFailed ? "failed" : "pending";
}

/** Depo kararı: iade bacağı → ret, çıkış bacağı → onay, depoda → sürüyor. */
export function tradeWarehouseDecision(
  trade: Pick<TradeRefundPayload, "status" | "shipments">,
): AdminRefundWarehouseDecision | null {
  if (
    trade.status === "returning" ||
    trade.shipments.some((leg) => leg.leg === "return")
  ) {
    return "rejected";
  }
  if (trade.shipments.some((leg) => leg.leg === "from_warehouse")) {
    return "approved";
  }
  if (trade.status === "at_warehouse" || trade.status === "admin_reviewing") {
    return "pending";
  }
  return null;
}

/**
 * Takasın iade anı: kapanış (`cancelledAt`), yoksa depo reddi (iade
 * bacaklarının açıldığı an), yoksa itirazın açıldığı an, yoksa son hareket.
 */
export function tradeRefundStartedAt(trade: TradeRefundPayload): Date {
  return (
    trade.cancelledAt ??
    trade.shipments.find((leg) => leg.leg === "return")?.createdAt ??
    trade.dispute?.createdAt ??
    trade.updatedAt
  );
}

const joined = (values: readonly (string | null | undefined)[]) => {
  const present = values.filter((value): value is string => !!value);
  return present.length > 0 ? present.join(", ") : null;
};

/**
 * Takasın İKİ satırı: takas başlatan (initiator) ve takas devam ettiren
 * (responder, ilan sahibi). Her satır kendi tarafının ödemesini, kendi
 * ürünlerini ve kendi kargo bacaklarını taşır; alıcı = bu taraf, satıcı =
 * karşı taraf. Takas siparişi olmadığı için `order` takasın kendisidir.
 */
export function mapTradeRefundRows(
  trade: TradeRefundPayload,
  ctx: TradeRefundRowContext,
): AdminRefundRow[] {
  const handedToCargo = isTradeHandedToCargo({
    firstWarehouseArrivalAt: trade.firstWarehouseArrivalAt,
    anyLegShipped: trade.shipments.some((leg) => leg.shippedAt != null),
  });
  const hasReturnLeg = trade.shipments.some((leg) => leg.leg === "return");
  const kind = tradeRefundKindOf({
    firstWarehouseArrivalAt: trade.firstWarehouseArrivalAt,
    hasReturnLeg,
  });
  const decision = tradeWarehouseDecision(trade);
  const startedAt = tradeRefundStartedAt(trade).toISOString();
  const closed = (TRADE_REFUND_CLOSED_STATUSES as readonly string[]).includes(
    trade.status,
  );
  const sides = {
    initiator: {
      user: trade.initiator,
      userId: trade.initiatorId,
      counterpart: trade.receiver,
      counterpartId: trade.receiverId,
      itemSide: "initiator",
    },
    responder: {
      user: trade.receiver,
      userId: trade.receiverId,
      counterpart: trade.initiator,
      counterpartId: trade.initiatorId,
      itemSide: "receiver",
    },
  } as const;

  return ADMIN_REFUND_TRADE_ROLES.map((role): AdminRefundRow => {
    const side = sides[role];
    const otherRole = ADMIN_REFUND_TRADE_ROLES.find((r) => r !== role) ?? role;
    const items = trade.items.filter((item) => item.side === side.itemSide);
    const payment =
      trade.cashPayments.find((row) => row.payerId === side.userId) ?? null;
    const counterpartPayment =
      trade.cashPayments.find((row) => row.payerId === side.counterpartId) ??
      null;
    const charged =
      payment != null &&
      TRADE_REFUND_CHARGED_PAYMENT_STATUSES.includes(payment.status);
    const policyPayment = payment ? policyPaymentOf(payment) : null;

    const providerPayment = payment?.payment ?? null;
    const attempts = providerPayment
      ? trade.refundAttempts.filter((a) => a.paymentId === providerPayment.id)
      : [];
    const latestAttempt = attempts[attempts.length - 1] ?? null;
    const refunded = attempts
      .filter((a) => a.status === "succeeded" || a.status === "finalized")
      .reduce((sum, a) => sum.plus(money(a.amount)), money(0));
    const expected =
      payment && policyPayment && providerPayment && !payment.refundedAt
        ? tradePaymentRefundableAmountFor(
            {
              ...policyPayment,
              paymentStatus: providerPayment.status,
              provider: providerPayment.provider,
              releasedAt: payment.releasedAt,
              refundedAt: payment.refundedAt,
            },
            { handedToCargo },
          )
        : 0;
    const refundAmount = payment?.refundedAt ? refunded : money(expected);
    const deduction =
      charged && payment && !payment.releasedAt
        ? Prisma.Decimal.max(
            money(payment.totalAmount).minus(refundAmount),
            money(0),
          )
        : money(0);

    // Fiyat farkı: + bu taraf farkı ödedi, − fark bu tarafa ödendi.
    const ownDifference = money(payment?.amount);
    const owedDifference =
      counterpartPayment?.recipientId === side.userId
        ? money(counterpartPayment.amount)
        : money(0);
    const priceDifference = ownDifference.gt(0)
      ? ownDifference
      : owedDifference.negated();

    const toWarehouse = trade.shipments.find(
      (leg) => leg.leg === "to_warehouse" && leg.shipperId === side.userId,
    );
    const returnLeg = trade.shipments.find(
      (leg) => leg.leg === "return" && leg.recipientUserId === side.userId,
    );

    return {
      id: tradeRefundRowId(trade.id, role),
      refundNo: `${trade.tradeNumber}-${TRADE_REFUND_ROLE_SUFFIX[role]}`,
      createdAt: startedAt,
      kind,
      origin: "trade",
      isTest: trade.isTest,
      order: {
        id: trade.id,
        orderNumber: trade.tradeNumber,
        createdAt: trade.createdAt.toISOString(),
        groupNumber: null,
        packageTrackingNo: trackingOf(toWarehouse),
      },
      buyer: refundParty(partyOf(side.user)),
      seller: refundParty(partyOf(side.counterpart)),
      product: {
        id: items[0]?.product.id ?? "",
        title: joined(items.map((item) => item.product.title)) ?? "",
        productCode: joined(items.map((item) => item.product.productCode)),
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        refundQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      },
      money: {
        unitPrice: toMoney(
          items.reduce(
            (sum, item) =>
              sum.plus(money(item.valueAtTrade).times(item.quantity)),
            money(0),
          ),
        ),
        commissionRate: null,
        commissionAmount: policyPayment
          ? tradeServiceFeeOf(policyPayment)
          : null,
        refundableCommissionRate: null,
        refundableCommissionAmount:
          charged && policyPayment ? refundedServiceFeeOf(policyPayment) : null,
        listingCommissionAmount: null,
        offerCommissionAmount: null,
        priceDifference: trade.cashPayments.length
          ? toMoney(priceDifference)
          : null,
        buyerDeduction: toMoney(deduction),
        sellerDeduction: 0,
        refundAmount: toMoney(refundAmount),
        status: tradeSideMoneyStatus({
          charged,
          refundedAt: payment?.refundedAt ?? null,
          attemptStatus: latestAttempt?.status ?? null,
          refundFailed: trade.refundFailureReason != null,
          expected,
        }),
        refundedAt: iso(payment?.refundedAt),
      },
      returnShipment: returnLeg
        ? { trackingNo: trackingOf(returnLeg), status: returnLeg.status }
        : null,
      warehouse: {
        arrivalStatus: toWarehouse?.status ?? null,
        decision,
        outboundAt: iso(returnLeg?.shippedAt),
        // Etiket yalnız ZPL olarak saklanır; indirilebilir bir adresi yok.
        outboundLabelUrl: null,
        returnToCustomersStatus: returnLeg?.status ?? null,
      },
      reason: {
        code: trade.adminCancelReasonCode ?? null,
        label: null,
        note: trade.cancelReason ?? trade.dispute?.reason ?? null,
      },
      status: trade.status,
      completedAt: iso(
        payment?.refundedAt ?? (closed ? trade.cancelledAt : null),
      ),
      returnInvoice: invoiceRef(
        payment ? ctx.returnInvoiceByCashPayment.get(payment.id) : null,
      ),
      trade: {
        tradeId: trade.id,
        tradeNumber: trade.tradeNumber,
        role,
        counterpartRefundId: tradeRefundRowId(trade.id, otherRole),
      },
    };
  });
}
