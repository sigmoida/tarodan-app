import {
  OrderStatus,
  PaymentHoldStatus,
  Prisma,
  RefundFaultParty,
  RefundRequestStatus,
} from "@prisma/client";
import type {
  HoldReleasability,
  HoldReleaseBlockedReason,
} from "@tarodan/types";

/**
 * Bir escrow hold'unun satıcıya bırakılıp ödenebilmesinin TEK tanımı.
 *
 * Admin manuel bırakma, saatlik `releaseHoldsDue` cron'u, payout oluşturma /
 * transfer etme / iade-void'lu payout'u yeniden kuyruğa alma yolları ve admin
 * hold listesinin `releasable` rozeti bu dosyadaki yüklemleri okur. Kural iki
 * yerde yazılırsa liste "bırakılabilir" der, bırakma reddeder (ya da tersi).
 *
 * İki meşru yol var:
 * 1. Normal: sipariş teslim edilmiş (delivered / awaiting_buyer_confirmation /
 *    completed), açık iade yok, hold kilitsiz, `releaseAt` geçmiş.
 * 2. KALINTI (residual): sipariş iade/iptalle KAPANMIŞ (cancelled / refunded)
 *    ama iade hold'u tamamen tüketmemiş — `amount − refundedAmount > 0`. Bu
 *    yalnız `holdRetainedAmount` (satıcının kargo payı tazmini) ile olur. Ürün
 *    kararı: kusur satıcıda DEĞİLSE bu tutar satıcıya ödenir; satıcıdaysa asla.
 *    Eskiden her bırakma yolu yalnız teslim edilmiş siparişi kabul ettiği için
 *    bu para escrow'da süresiz kalıyordu.
 *
 * Satıcı kusurlu kalıntı (`seller_at_fault`) GEÇİCİ bir durumdur: o para
 * PLATFORMUNDUR, alıcının değil — alıcı ödediğinin tamamını (T) zaten geri
 * almıştır; satıcının kargo payı T'de değil, satıcının hak edişinden
 * düşülmüştür. Alıcıya ikinci kez iade edilemez (PSP tavanı T'dir). Bu yüzden
 * PSP'ye gitmeden platforma KAPATILIR (`holdResidualSettleable` →
 * `PaymentHoldResidualService`: admin ucu + bakım script'i). Kaynağı da
 * kapandı: satıcı kusurlu kargo öncesi iptal artık satıcı payını tazmin
 * etmez, hold tamamen tüketilir.
 */

/** Normal bırakmanın sipariş durumları. */
export const PAYOUT_ELIGIBLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.delivered,
  OrderStatus.awaiting_buyer_confirmation,
  OrderStatus.completed,
];

/** Kalıntı bırakmanın sipariş durumları: iade/iptalle kapanmış sipariş. */
export const RESIDUAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.cancelled,
  OrderStatus.refunded,
];

/** Parayı hâlâ bağlayan (sonuçlanmamış) iade talebi durumları. */
export const OPEN_REFUND_STATUSES: readonly RefundRequestStatus[] = [
  RefundRequestStatus.pending_review,
  RefundRequestStatus.approved,
  RefundRequestStatus.wait_for_delivery,
  RefundRequestStatus.return_shipment_open,
  RefundRequestStatus.return_in_transit,
  RefundRequestStatus.return_delivered,
  RefundRequestStatus.disputed,
];

/** Bu tutarın altındaki kalıntı "sıfır" sayılır (kuruş artıkları). */
export const HOLD_RESIDUAL_MIN = new Prisma.Decimal("0.01");

/** `RefundRequest.policyCode` şema varsayılanı: politika hiç yazılmamış talep. */
const LEGACY_POLICY_CODE = "legacy";

/**
 * Siparişten yüklemin ihtiyaç duyduğu her şey — TEK okumada. Açık talepler
 * "frozen" kararını, sonuçlanmış (`refunded`) talepler kusur kararını besler.
 */
export const HOLD_RELEASE_ORDER_SELECT = {
  status: true,
  refundRequests: {
    where: {
      status: {
        in: [...OPEN_REFUND_STATUSES, RefundRequestStatus.refunded],
      },
    },
    select: { status: true, faultParty: true, policyCode: true },
  },
} satisfies Prisma.OrderSelect;

export interface RefundFaultFacts {
  faultParty: RefundFaultParty | null;
  policyCode: string;
}

export interface HoldReleaseOrderFacts {
  status: OrderStatus;
  /** Sonuçlanmamış iade talebi var mı (`OPEN_REFUND_STATUSES`). */
  hasOpenRefund: boolean;
  /** Sonuçlanmış (`refunded`) iade/iptal talepleri — kusurun kaynağı. */
  finalizedRefunds: readonly RefundFaultFacts[];
}

export interface HoldReleaseHoldFacts {
  status: PaymentHoldStatus;
  frozenByRefundId: string | null;
  amount: Prisma.Decimal.Value;
  refundedAmount: Prisma.Decimal.Value | null;
  releaseAt: Date | null;
}

/** `HOLD_RELEASE_ORDER_SELECT` ile okunmuş siparişi yüklemin girdisine çevirir. */
export function holdReleaseOrderFacts(order: {
  status: OrderStatus;
  refundRequests: ReadonlyArray<
    RefundFaultFacts & { status: RefundRequestStatus }
  >;
}): HoldReleaseOrderFacts {
  return {
    status: order.status,
    hasOpenRefund: order.refundRequests.some((request) =>
      OPEN_REFUND_STATUSES.includes(request.status),
    ),
    finalizedRefunds: order.refundRequests.filter(
      (request) => request.status === RefundRequestStatus.refunded,
    ),
  };
}

/**
 * Kusur satıcıda mı — OTORİTE `RefundRequest.faultParty`.
 *
 * Neden kargo tazminatı bileşeni değil: `seller_refund` gidiş-kargo bileşeni
 * (= `holdRetainedAmount`) "kusur satıcıda değil" demek DEĞİLDİR. Kargoya
 * verilmeden iptal edilen siparişte v2 hesabı satıcının kargo payını kusurdan
 * BAĞIMSIZ iade eder (taşıma hiç doğmadı); v1'in `seller_fault_cancellation`
 * kuralı da kargo öncesi satıcı payını tazmin eder. Bileşene bakmak satıcı
 * kusurlu iptalde kalıntıyı satıcıya öderdi.
 *
 * `faultParty` admin'in/politikanın kesinleştirdiği finansal gerçektir (v2
 * her talepte yazar). Yalnız v1 (eski) talepte boştur; orada kusur
 * `policyCode`'dadır (`seller_fault_return`, `seller_fault_cancellation`).
 * Politikasız (`legacy`) ve tarafsız talepte kusur BELİRLENEMEZ — şüphede
 * ödenmez, satıcı kusuru sayılır (PAYMENTS.md §5 kalıntı kuralı).
 */
export function isSellerFaultRefund(refund: RefundFaultFacts): boolean {
  if (refund.faultParty) return refund.faultParty === RefundFaultParty.seller;
  if (refund.policyCode === LEGACY_POLICY_CODE) return true;
  return refund.policyCode.startsWith("seller_fault");
}

/**
 * Is the seller fault NAMED (the v2 `faultParty` column, or a v1
 * `seller_fault_*` policy code), rather than only assumed because the fault
 * cannot be determined (a `legacy` request without a fault party)? Both block
 * the payout (`isSellerFaultRefund`), but only a named fault may be settled to
 * the platform without a person looking at it (decision D20).
 */
export function isNamedSellerFaultRefund(refund: RefundFaultFacts): boolean {
  if (!isSellerFaultRefund(refund)) return false;
  return refund.faultParty != null || refund.policyCode !== LEGACY_POLICY_CODE;
}

/**
 * Has the seller forfeited their own shipping share on this order? Yes once
 * ANY finalized refund of the order is seller fault (`isSellerFaultRefund`,
 * v1 and v2), whichever unit or request it was (decision D20). The share then
 * stays with the platform: the v2 policy emits no `seller_refund` shipping
 * component and the hold consumption retains nothing, so neither the normal
 * release (order still delivered) nor the residual release (order closed)
 * ever sees it. The residual block below reads the same rule.
 */
export function sellerShareForfeited(
  finalizedRefunds: readonly RefundFaultFacts[],
): boolean {
  return finalizedRefunds.some(isSellerFaultRefund);
}

/** Satıcıya kalan tutar: `amount − refundedAmount` (negatife inmez). */
export function holdResidual(hold: {
  amount: Prisma.Decimal.Value;
  refundedAmount: Prisma.Decimal.Value | null;
}): Prisma.Decimal {
  const residual = new Prisma.Decimal(hold.amount).minus(
    new Prisma.Decimal(hold.refundedAmount ?? 0),
  );
  return residual.isNegative() ? new Prisma.Decimal(0) : residual;
}

/**
 * Siparişin durumu bu hold'un parasının satıcıya gitmesine izin veriyor mu?
 * Payout yolları (hold zaten `released` iken) da bunu okur; açık iade ayrı
 * guard'dır (`findBlockingRefund` / `hasOpenRefund`).
 *
 * Kapanmış siparişte sonuçlanmış talep YOKSA kusur belirlenemez — şüphede
 * ödenmez ("seller_at_fault").
 */
export function holdPayoutOrderBlock(
  order: Pick<HoldReleaseOrderFacts, "status" | "finalizedRefunds">,
): HoldReleaseBlockedReason | null {
  if (PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status)) return null;
  if (!RESIDUAL_ORDER_STATUSES.includes(order.status)) {
    return "order_not_terminal";
  }
  if (
    order.finalizedRefunds.length === 0 ||
    sellerShareForfeited(order.finalizedRefunds)
  ) {
    return "seller_at_fault";
  }
  return null;
}

/**
 * Bırakma tarihi geldi mi. Kapanmış siparişin damgasız hold'u (kargoya
 * verilmeden iptal: teslim hiç olmadığı için `releaseAt` hiç yazılmadı)
 * beklenecek bir iade penceresi taşımaz — hemen vadelidir. Teslim edilmiş
 * siparişin damgasız hold'u ise vadesiz kalır (ayrı uyarı:
 * `deliveredHoldsWithoutRelease`).
 */
function isReleaseDue(
  hold: Pick<HoldReleaseHoldFacts, "releaseAt">,
  order: Pick<HoldReleaseOrderFacts, "status">,
  now: Date,
): boolean {
  if (hold.releaseAt) return hold.releaseAt.getTime() <= now.getTime();
  return RESIDUAL_ORDER_STATUSES.includes(order.status);
}

/**
 * Hold neden bırakılamıyor — `null` ise bırakılabilir. Sıra anlamlıdır: önce
 * hold'un kendi durumu, sonra kilit, sonra sipariş, en son tarih.
 *
 * `ignoreReleaseDate` (admin "erken bırak"): YALNIZ tarih şartını esnetir;
 * kilit, sipariş durumu ve kusur şartları aynen geçerli kalır.
 */
export function holdReleaseBlockedReason(input: {
  hold: HoldReleaseHoldFacts;
  order: HoldReleaseOrderFacts | null;
  now: Date;
  ignoreReleaseDate?: boolean;
}): HoldReleaseBlockedReason | null {
  const { hold, order, now } = input;
  if (hold.status !== PaymentHoldStatus.held) return "already_released";
  if (hold.frozenByRefundId || order?.hasOpenRefund) return "frozen";
  if (!order) return "order_not_terminal";
  const orderBlock = holdPayoutOrderBlock(order);
  if (orderBlock) return orderBlock;
  // Payout'un "sıfır net" eşiğiyle aynı (`netPayout <= PAYOUT_MIN_NET`).
  if (holdResidual(hold).lessThanOrEqualTo(HOLD_RESIDUAL_MIN)) {
    return "already_released";
  }
  if (!input.ignoreReleaseDate && !isReleaseDue(hold, order, now)) {
    return "not_due";
  }
  return null;
}

/**
 * Kapanmış (iade/iptal) siparişin hold'unda kalan tutar satıcıya bırakılabilir
 * mi: hold tutuluyor, kilitsiz, kalıntı > 0, sipariş kapanmış, kusur satıcıda
 * değil, tarih gelmiş. `holdReleaseBlockedReason`'ın kalıntı yoluna özel okuması.
 */
export function holdResidualPayable(
  hold: HoldReleaseHoldFacts,
  order: HoldReleaseOrderFacts,
  now: Date,
): boolean {
  return (
    RESIDUAL_ORDER_STATUSES.includes(order.status) &&
    holdReleaseBlockedReason({ hold, order, now }) === null
  );
}

/**
 * Kapanmış (iade/iptal) siparişin hold'unda KALAN tutar — kalıntı yollarının
 * (satıcıya bırakma ya da platforma kapatma) üzerinde çalıştığı para. Hold
 * tutulmuyorsa ya da sipariş kapanmamışsa 0: açık siparişte `amount −
 * refundedAmount` kalıntı değil, henüz hak edilmemiş satıcı payıdır.
 */
export function closedOrderHoldResidual(
  hold: Pick<HoldReleaseHoldFacts, "status" | "amount" | "refundedAmount">,
  order: Pick<HoldReleaseOrderFacts, "status"> | null,
): Prisma.Decimal {
  if (
    hold.status !== PaymentHoldStatus.held ||
    !order ||
    !RESIDUAL_ORDER_STATUSES.includes(order.status)
  ) {
    return new Prisma.Decimal(0);
  }
  return holdResidual(hold);
}

/**
 * Satıcı kusurlu kalıntı platforma KAPATILABİLİR mi: hold tutuluyor, kilitsiz,
 * açık iade yok, sipariş kapanmış, kalıntı > eşik ve bırakmayı engelleyen TEK
 * neden `seller_at_fault` (kusur satıcıda ya da belirlenemiyor — şüphede
 * satıcıya ödenmez kuralının diğer yüzü). Tarih şartı aranmaz: kapatma
 * satıcıya ödeme değildir, beklenecek bir iade penceresi yoktur.
 */
export function holdResidualSettleable(
  hold: HoldReleaseHoldFacts,
  order: HoldReleaseOrderFacts | null,
  now: Date,
): boolean {
  return (
    holdReleaseBlockedReason({ hold, order, now, ignoreReleaseDate: true }) ===
      "seller_at_fault" &&
    closedOrderHoldResidual(hold, order).greaterThan(HOLD_RESIDUAL_MIN)
  );
}

/**
 * Admin hold listesinin satır alanları — bırakma ve kapatma ile AYNI
 * yüklemlerden. `order`, `HOLD_RELEASE_ORDER_SELECT` ile okunmuş sipariştir
 * (`null`: bulunamadı).
 */
export function holdReleasabilityOf(
  hold: HoldReleaseHoldFacts,
  order: Parameters<typeof holdReleaseOrderFacts>[0] | null,
  now: Date,
): HoldReleasability {
  const facts = order ? holdReleaseOrderFacts(order) : null;
  const reason = holdReleaseBlockedReason({ hold, order: facts, now });
  return {
    releasable: reason === null,
    releaseBlockedReason: reason,
    orderStatus: order?.status ?? null,
    residualAmount: closedOrderHoldResidual(hold, facts).toNumber(),
    residualSettleable: holdResidualSettleable(hold, facts, now),
  };
}

/** Ret nedeninin yerelleştirilmiş mesaj anahtarı. */
export const HOLD_RELEASE_BLOCKED_MESSAGE_KEYS = {
  frozen: "server.payment.holdReleaseBlocked.frozen",
  not_due: "server.payment.holdReleaseBlocked.notDue",
  order_not_terminal: "server.payment.holdReleaseBlocked.orderNotTerminal",
  seller_at_fault: "server.payment.holdReleaseBlocked.sellerAtFault",
  already_released: "server.payment.holdReleaseBlocked.alreadyReleased",
} as const satisfies Record<HoldReleaseBlockedReason, string>;
