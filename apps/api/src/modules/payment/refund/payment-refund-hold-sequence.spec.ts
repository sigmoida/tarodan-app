import {
  CancellationActor,
  OrderStatus,
  PaymentHoldStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  RefundAttemptStatus,
  RefundRequestStatus,
} from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import { PaymentHoldReleaseService } from "./payment-hold-release.service";
import { PayoutService } from "../../payout/payout.service";
import { RefundFinancialService } from "../../refund/refund-financial.service";
import {
  calculateRefundFinancialsV2,
  RefundFaultPartyV2,
  RefundFinancialComponentV2,
} from "../../refund/helpers/refund-financial-policy-v2";
import {
  calculateRefundFinancials,
  resolveReturnPolicy,
} from "../../refund/helpers/refund-financial-policy";
import {
  holdReleaseBlockedReason,
  holdReleaseOrderFacts,
  holdResidualSettleable,
  sellerShareForfeited,
} from "../../payout/helpers/hold-release-eligibility";

/**
 * The critical path refund -> hold consumption -> hold release -> payout,
 * run through the real services on one stateful in-memory database: the v2
 * (or v1) policy computes each refund, `processRefund` consumes the hold, the
 * hourly `releaseHoldsDue` cron releases it and `createPayoutsForReleasedHolds`
 * creates the seller's transfer. Each step reads what the previous one wrote,
 * so these tests pin the money that actually reaches the seller, not one
 * function's output.
 *
 * Fixture (PAYMENTS.md §5 shape, service VAT 20%), one line of `quantity`
 * units:
 *   product 1000, buyer shipping 50 (+10 VAT), buyer commission 50 (+10),
 *   buyer platform fee 25 (+5)                               -> T = 1150
 *   seller commission 80 (+16), seller platform fee 20 (+4),
 *   seller shipping 40 (+8 VAT), full outbound shipping 90
 *   hold = 1150 - fees 175 - service VAT 25 - 28 - shipping 90 = 832
 *   the seller's shipping share they paid up front = 40 + 8 = 48 gross
 * Return shipping 30 (+6 VAT).
 */
const ORDER_ID = "order-1";
const HOLD_AMOUNT = "832.00";
const PAYMENT_AMOUNT = 1150;
const SHARE = 48;
const PAST = new Date(Date.now() - 60 * 60 * 1000);

const V2_ORDER_MONEY = {
  productGrossAmount: 1000,
  productTaxAmount: 0,
  buyerShippingAmount: 50,
  sellerShippingAmount: 40,
  outboundFullShippingAmount: 90,
  buyerCommissionAmount: 50,
  buyerPlatformFeeAmount: 25,
  sellerCommissionAmount: 80,
  sellerPlatformFeeAmount: 20,
  serviceVatRate: 20,
  returnShippingAmount: 30,
};

const V1_ORDER_MONEY = {
  totalAmount: PAYMENT_AMOUNT,
  buyerShippingAmount: 50,
  buyerFeeAmount: 75,
  buyerServiceFeeAmount: 25,
  buyerServiceTaxAmount: 25,
  serviceVatRate: 20,
  sellerFeeAmount: 100,
  sellerCommissionAmount: 80,
  sellerPlatformFeeAmount: 20,
  returnShippingAmount: 36,
  sellerShippingAmount: 40,
};

interface AttemptRow {
  id: string;
  paymentId: string;
  orderId: string;
  idempotencyKey: string;
  amount: number;
  status: RefundAttemptStatus;
  providerRefundId: string | null;
  providerResponse: Prisma.JsonValue | null;
  tradeId: null;
}

interface HoldRow {
  id: string;
  orderId: string;
  paymentId: string;
  sellerId: string;
  amount: Prisma.Decimal;
  refundedAmount: Prisma.Decimal;
  status: PaymentHoldStatus;
  frozenByRefundId: string | null;
  releaseAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
}

type Where = Record<string, unknown>;

/** `status: X` or `status: { in: [...] }` against a row's value. */
function matchesStatus(value: unknown, filter: unknown): boolean {
  if (filter == null) return true;
  if (typeof filter === "object" && "in" in (filter as object)) {
    return ((filter as { in: unknown[] }).in ?? []).includes(value);
  }
  return value === filter;
}

/** Any method on any property resolves to undefined (notifications, events). */
function inert(): never {
  return new Proxy(
    {},
    {
      get: (target: Record<string | symbol, unknown>, key) => {
        if (key === "then") return undefined;
        target[key] ??= jest.fn().mockResolvedValue(undefined);
        return target[key];
      },
    },
  ) as never;
}

function makeWorld(quantity: number) {
  const state = {
    payment: {
      id: "pay-1",
      orderId: ORDER_ID,
      checkoutGroupId: null,
      amount: new Prisma.Decimal(PAYMENT_AMOUNT),
      provider: "paytr",
      paytrMerchant: "marketplace",
      status: PaymentStatus.completed as PaymentStatus,
      providerConversationId: "OID1",
      metadata: {} as Record<string, unknown>,
      isTest: false,
    },
    order: {
      id: ORDER_ID,
      orderNumber: "ORD1",
      status: OrderStatus.delivered as OrderStatus,
      quantity,
      productId: "prod-1",
      sellerId: "s1",
      buyerId: "b1",
      totalAmount: new Prisma.Decimal(PAYMENT_AMOUNT),
      commissionAmount: new Prisma.Decimal(175),
      withholdingTaxAmount: new Prisma.Decimal(0),
      deliveredAt: new Date("2026-10-01T09:00:00.000Z"),
      stockRestoredAt: null as Date | null,
      offerId: null,
      cancelledBy: null as CancellationActor | null,
      checkoutGroupId: null,
      packageId: null,
      isTest: false,
    },
    hold: {
      id: "hold-1",
      orderId: ORDER_ID,
      paymentId: "pay-1",
      sellerId: "s1",
      amount: new Prisma.Decimal(HOLD_AMOUNT),
      refundedAmount: new Prisma.Decimal(0),
      status: PaymentHoldStatus.held,
      frozenByRefundId: null,
      releaseAt: PAST,
      releasedAt: null,
      createdAt: new Date("2026-09-28T09:00:00.000Z"),
    } as HoldRow,
    product: {
      quantity: 0,
      status: ProductStatus.sold as ProductStatus,
      inactiveReason: null,
    },
    attempts: [] as AttemptRow[],
    refundRequests: [] as Array<{
      status: RefundRequestStatus;
      faultParty: RefundFaultPartyV2 | null;
      policyCode: string;
    }>,
    sellerAdjustments: [] as Array<{ sourceKey: string; amount: number }>,
    payouts: [] as Array<Record<string, unknown>>,
  };

  const attemptsWhere = (where: Where) =>
    state.attempts.filter(
      (a) =>
        (where.id == null || a.id === where.id) &&
        (where.paymentId == null || a.paymentId === where.paymentId) &&
        (where.orderId === undefined || a.orderId === where.orderId) &&
        matchesStatus(a.status, where.status),
    );

  const holdMatches = (where: Where) => {
    const h = state.hold;
    if (where.id != null) {
      const id = where.id as string | { in: string[] };
      if (typeof id === "string" ? h.id !== id : !id.in.includes(h.id)) {
        return false;
      }
    }
    if (where.orderId != null && h.orderId !== where.orderId) return false;
    if (!matchesStatus(h.status, where.status)) return false;
    if (
      "frozenByRefundId" in where &&
      h.frozenByRefundId !== where.frozenByRefundId
    ) {
      return false;
    }
    const releaseAt = where.releaseAt as { lte: Date } | undefined;
    if (releaseAt && !(h.releaseAt && h.releaseAt <= releaseAt.lte)) {
      return false;
    }
    if ("payoutTransfer" in where && state.payouts.length > 0) return false;
    return true;
  };

  const applyHold = (data: Record<string, unknown>) => {
    const next = { ...data };
    if (next.refundedAmount != null) {
      next.refundedAmount = new Prisma.Decimal(
        next.refundedAmount as Prisma.Decimal.Value,
      );
    }
    Object.assign(state.hold, next);
  };

  const db: Record<string, unknown> = {
    $queryRaw: jest.fn((query: unknown) => {
      // Row locks (tagged templates) return nothing; the residual candidate
      // query is a Prisma.Sql JOIN of holds on closed orders.
      const sql = (query as { sql?: unknown } | null)?.sql;
      if (typeof sql === "string" && sql.includes("payment_holds")) {
        const closed =
          state.order.status === OrderStatus.cancelled ||
          state.order.status === OrderStatus.refunded;
        return Promise.resolve(
          closed &&
            state.hold.status === PaymentHoldStatus.held &&
            !state.hold.frozenByRefundId &&
            !state.hold.releaseAt
            ? [{ id: state.hold.id, createdAt: state.hold.createdAt }]
            : [],
        );
      }
      return Promise.resolve([]);
    }),
    payment: {
      findFirst: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          where.orderId === ORDER_ID &&
            matchesStatus(state.payment.status, where.status)
            ? { ...state.payment, order: { ...state.order } }
            : null,
        ),
      ),
      findUnique: jest.fn(() =>
        Promise.resolve({ metadata: state.payment.metadata }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (data.status) state.payment.status = data.status as PaymentStatus;
        if (data.metadata) {
          state.payment.metadata = data.metadata as Record<string, unknown>;
        }
        return Promise.resolve({});
      }),
    },
    order: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          ...state.order,
          refundRequests: state.refundRequests.map((r) => ({ ...r })),
        }),
      ),
      findMany: jest.fn(() => Promise.resolve([{ ...state.order }])),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.order, data);
        return Promise.resolve({ ...state.order });
      }),
    },
    product: {
      findUnique: jest.fn(() => Promise.resolve({ ...state.product })),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const { quantity, ...rest } = data as {
          quantity?: { increment: number };
        };
        if (quantity) state.product.quantity += quantity.increment;
        Object.assign(state.product, rest);
        return Promise.resolve({});
      }),
      // The removal-reason stamp of a quarantined listing (listing-removal.ts).
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productRemovalEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    offer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    paymentHold: {
      findFirst: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(holdMatches(where) ? { ...state.hold } : null),
      ),
      findMany: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          holdMatches(where)
            ? [
                {
                  ...state.hold,
                  payment: { ...state.payment },
                  seller: {
                    bankAccount: {
                      iban: "TR000000000000000000000000",
                      accountHolder: "Demo Seller",
                    },
                  },
                },
              ]
            : [],
        ),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        applyHold(data);
        return Promise.resolve({ ...state.hold });
      }),
      updateMany: jest.fn(
        ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          if (!holdMatches(where)) return Promise.resolve({ count: 0 });
          applyHold(data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    refundAttempt: {
      findUnique: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          state.attempts.find((a) =>
            where.id
              ? a.id === where.id
              : a.idempotencyKey === where.idempotencyKey,
          ) ?? null,
        ),
      ),
      findFirst: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(attemptsWhere(where)[0] ?? null),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row: AttemptRow = {
          id: `attempt-${state.attempts.length + 1}`,
          paymentId: data.paymentId as string,
          orderId: data.orderId as string,
          idempotencyKey: data.idempotencyKey as string,
          amount: Number(data.amount),
          status: RefundAttemptStatus.prepared,
          providerRefundId: null,
          providerResponse: null,
          tradeId: null,
        };
        state.attempts.push(row);
        return Promise.resolve({ ...row });
      }),
      update: jest.fn(
        ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          const row = state.attempts.find((a) => a.id === where.id)!;
          Object.assign(row, data);
          return Promise.resolve({ ...row });
        },
      ),
      updateMany: jest.fn(
        ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          const rows = attemptsWhere(where);
          rows.forEach((row) => Object.assign(row, data));
          return Promise.resolve({ count: rows.length });
        },
      ),
    },
    refundRequest: {
      findMany: jest.fn(() =>
        Promise.resolve(
          state.refundRequests
            .filter((r) => r.status === RefundRequestStatus.refunded)
            .map(({ faultParty, policyCode }) => ({ faultParty, policyCode })),
        ),
      ),
      // Every request in these tests is finalized: none is open.
      findFirst: jest.fn().mockResolvedValue(null),
    },
    sellerAccountAdjustment: {
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        if (
          !state.sellerAdjustments.some((a) => a.sourceKey === create.sourceKey)
        ) {
          state.sellerAdjustments.push({
            sourceKey: create.sourceKey as string,
            amount: Number(create.amount),
          });
        }
        return Promise.resolve({});
      }),
      // Debt netting on the payout has its own spec
      // (payout-seller-adjustment.spec.ts); here the transfer is plain.
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payoutTransfer: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        state.payouts.push(data);
        return Promise.resolve({});
      }),
    },
    tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));

  const paytr = {
    createRefund: jest.fn((oid: string) =>
      Promise.resolve({ status: "success", merchant_oid: oid }),
    ),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const refunds = new PaymentRefundService(
    db as never,
    config as never,
    { resolve: () => paytr } as never,
    inert(), // eventService
    inert(), // notificationService
    inert(), // commissionLedger (its own specs pin the ledger rows)
    inert(), // invoicing
    inert(), // paymentCommon
    inert(), // providerEvents
    {} as never, // holdRelease (not used by processRefund)
    new PaymentRefundAttemptService(db as never),
    {} as never, // tradeRefunds
    {} as never, // boostTimeline (not a boost order)
  );
  const holdRelease = new PaymentHoldReleaseService(
    db as never,
    config as never,
    inert(),
    inert(),
  );
  const payouts = new PayoutService(
    db as never,
    {} as never,
    config as never,
    inert(),
  );
  const financials = new RefundFinancialService({} as never, {} as never);

  let returnedUnits = 0;
  let requestNo = 0;

  /** The settlement `finalizeRefundForReturnedShipment` builds for a request. */
  const settlementOf = (
    request: {
      id: string;
      faultParty: RefundFaultPartyV2 | null;
      policyCode: string;
    },
    units: number,
    components: RefundFinancialComponentV2[] | null,
    shipping: {
      sellerShippingCompensationAmount: number;
      outboundShippingChargeToSeller: number;
      returnShippingChargeToSeller: number;
    },
  ) => ({
    closeOrder: units >= quantity,
    holdPortion: Math.min(units / Math.max(quantity, 1), 1),
    ...financials.feeSettlementFromComponents(components, {
      sellerFeeAmount: 0,
      buyerFeeAmount: 0,
    }),
    ...financials.shippingSettlement(request, shipping, components),
  });

  const grossOf = (
    components: RefundFinancialComponentV2[],
    code: RefundFinancialComponentV2["componentCode"],
    treatment: RefundFinancialComponentV2["treatment"],
  ) =>
    components
      .filter((c) => c.componentCode === code && c.treatment === treatment)
      .reduce((sum, c) => sum + c.grossAmount, 0);

  /**
   * One v2 return request of `units`, finalized with `fault`, as the returned
   * shipment finalizer runs it: `completesLine` from the units returned so
   * far, `sellerShareForfeited` from the finalized requests (as
   * `computeV2Refund` reads them), idempotency key `refund-request:<id>`,
   * buyer as the cancel actor. `policyUnaware` computes the request as if it
   * had been finalized before the D20 rule existed (no forfeit flag), so only
   * the hold-consumption check in `processRefund` applies.
   */
  async function returnUnitsV2(
    units: number,
    fault: RefundFaultPartyV2,
    opts: { policyUnaware?: boolean } = {},
  ) {
    const completesLine = returnedUnits + units >= quantity;
    const financialsV2 = calculateRefundFinancialsV2({
      ...V2_ORDER_MONEY,
      orderQuantity: quantity,
      refundQuantity: units,
      faultParty: fault,
      hasShipped: true,
      completesLine,
      closesPackageShipping: completesLine,
      sellerShareForfeited: opts.policyUnaware
        ? false
        : sellerShareForfeited(state.refundRequests),
    });
    const rrId = `rr-${++requestNo}`;
    const { components } = financialsV2;
    const settlement = settlementOf(
      { id: rrId, faultParty: fault, policyCode: `v2_${fault}_return` },
      units,
      components,
      {
        sellerShippingCompensationAmount: grossOf(
          components,
          "outbound_shipping",
          "seller_refund",
        ),
        outboundShippingChargeToSeller: grossOf(
          components,
          "outbound_shipping",
          "seller_charge",
        ),
        returnShippingChargeToSeller: grossOf(
          components,
          "return_shipping",
          "seller_charge",
        ),
      },
    );
    const result = await refunds.processRefund(
      ORDER_ID,
      financialsV2.buyerRefundAmount,
      {
        skipRefundEvent: true,
        refundQuantity: units,
        idempotencyKey: `refund-request:${rrId}`,
        cancelledBy: CancellationActor.buyer,
        settlement,
      },
    );
    state.refundRequests.push({
      status: RefundRequestStatus.refunded,
      faultParty: fault,
      policyCode: `v2_${fault}_return`,
    });
    returnedUnits += units;
    return {
      rrId,
      cash: financialsV2.buyerRefundAmount,
      retained: settlement.holdRetainedAmount,
      result,
    };
  }

  /** One v1 return request (policy from the reason, no fault column). */
  async function returnUnitsV1(units: number, reason: string) {
    const policy = resolveReturnPolicy(reason);
    const v1 = calculateRefundFinancials(policy, {
      ...V1_ORDER_MONEY,
      orderQuantity: quantity,
      refundQuantity: units,
    });
    const rrId = `rr-${++requestNo}`;
    const settlement = settlementOf(
      { id: rrId, faultParty: null, policyCode: policy.policyCode },
      units,
      null,
      {
        sellerShippingCompensationAmount: v1.sellerShippingCompensationAmount,
        outboundShippingChargeToSeller: v1.outboundShippingChargeToSeller,
        returnShippingChargeToSeller: v1.returnShippingChargeToSeller,
      },
    );
    await refunds.processRefund(ORDER_ID, v1.buyerRefundAmount, {
      skipRefundEvent: true,
      refundQuantity: units,
      idempotencyKey: `refund-request:${rrId}`,
      cancelledBy: CancellationActor.buyer,
      settlement,
    });
    state.refundRequests.push({
      status: RefundRequestStatus.refunded,
      faultParty: null,
      policyCode: policy.policyCode,
    });
    returnedUnits += units;
    return {
      cash: v1.buyerRefundAmount,
      retained: settlement.holdRetainedAmount,
    };
  }

  /** The hourly cron, then the 15-minute payout producer. */
  async function releaseAndPay() {
    const released = await holdRelease.releaseHoldsDue();
    const payoutsCreated = await payouts.createPayoutsForReleasedHolds();
    return { released: released.count, payoutsCreated };
  }

  const cashRefunded = () =>
    Number(
      (state.payment.metadata.refundedOrders as Record<string, number>)?.[
        ORDER_ID
      ] ?? 0,
    );

  const holdBlockedReason = () =>
    holdReleaseBlockedReason({
      hold: state.hold,
      order: holdReleaseOrderFacts({
        status: state.order.status,
        refundRequests: state.refundRequests,
      }),
      now: new Date(),
    });

  const residualSettleable = () =>
    holdResidualSettleable(
      state.hold,
      holdReleaseOrderFacts({
        status: state.order.status,
        refundRequests: state.refundRequests,
      }),
      new Date(),
    );

  return {
    state,
    paytr,
    refunds,
    returnUnitsV2,
    returnUnitsV1,
    releaseAndPay,
    cashRefunded,
    holdBlockedReason,
    residualSettleable,
  };
}

const money = (value: Prisma.Decimal) => value.toFixed(2);

describe("refund -> hold consumption -> release -> payout (stateful, through the services)", () => {
  describe("two units returned one at a time", () => {
    it("buyer fault on both: the seller is paid exactly their 48 shipping share", async () => {
      const w = makeWorld(2);

      const first = await w.returnUnitsV2(1, "buyer");
      // Not the line-completing refund: no outbound legs, nothing retained.
      expect(first.cash).toBe(494); // 500 + 30 commission - 36 return shipping
      expect(first.retained).toBe(0);
      expect(money(w.state.hold.refundedAmount)).toBe("416.00");
      expect(w.state.hold.status).toBe(PaymentHoldStatus.held);

      const second = await w.returnUnitsV2(1, "buyer");
      // Completing refund: the buyer is charged the seller's share (48) and
      // the hold keeps it for the seller.
      expect(second.cash).toBe(446);
      expect(second.retained).toBe(SHARE);
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");
      expect(w.state.hold.status).toBe(PaymentHoldStatus.held);

      // 940 < T: the order stays delivered, both units back in stock
      // (quarantined: returned after delivery), the payment stays completed.
      expect(w.cashRefunded()).toBe(940);
      expect(w.state.order.status).toBe(OrderStatus.delivered);
      expect(w.state.product.quantity).toBe(2);
      expect(w.state.product.status).toBe(ProductStatus.inactive);
      expect(w.state.payment.status).toBe(PaymentStatus.completed);

      const run = await w.releaseAndPay();

      expect(run).toEqual({ released: 1, payoutsCreated: 1 });
      expect(w.state.hold.status).toBe(PaymentHoldStatus.released);
      expect(w.state.payouts).toHaveLength(1);
      expect(Number(w.state.payouts[0].netAmount)).toBe(SHARE);
      expect(w.state.payouts[0].paymentHoldId).toBe("hold-1");
    });

    it("carrier fault on the completing refund after a buyer-fault unit: still 48", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "buyer");
      const second = await w.returnUnitsV2(1, "carrier");

      // Carrier: the buyer gets the unit, the fees and the outbound shipping
      // back; the platform absorbs the parcel; the seller keeps the share.
      expect(second.cash).toBe(605); // 500 + 30 + 15 + 60
      expect(second.retained).toBe(SHARE);
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");
      expect(w.cashRefunded()).toBe(1099);
      expect(w.state.order.status).toBe(OrderStatus.delivered);

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([SHARE]);
    });

    it("carrier fault on both: the cash reaches T, the order closes and the residual 48 is paid", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "carrier");
      await w.returnUnitsV2(1, "carrier");

      expect(w.cashRefunded()).toBe(PAYMENT_AMOUNT);
      expect(w.state.payment.status).toBe(PaymentStatus.refunded);
      expect(w.state.order.status).toBe(OrderStatus.cancelled);
      // The order closed by cash, not by `closeOrder`: the hold still keeps
      // the share and is NOT cancelled.
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");
      expect(w.state.hold.status).toBe(PaymentHoldStatus.held);
      expect(w.holdBlockedReason()).toBeNull();
      expect(w.residualSettleable()).toBe(false);

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([SHARE]);
    });

    it("platform fault on the completing refund behaves like carrier fault", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "buyer");
      const second = await w.returnUnitsV2(1, "platform");

      expect(second.retained).toBe(SHARE);
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([SHARE]);
    });

    it("seller fault on both: nothing is retained, the hold is consumed and nothing is paid", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "seller");
      const second = await w.returnUnitsV2(1, "seller");

      expect(second.retained).toBe(0);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");
      // The seller also owes the outbound parcel and both return labels.
      expect(w.state.sellerAdjustments.map((a) => a.amount)).toEqual([
        36, 36, 108,
      ]);

      const run = await w.releaseAndPay();

      expect(run).toEqual({ released: 0, payoutsCreated: 0 });
      expect(w.state.payouts).toHaveLength(0);
    });
  });

  describe("three units returned 1 + 1 + 1 (thirds round at the kurus)", () => {
    it("buyer fault: two thirds of 832 consume 554.66, the last leaves exactly 48", async () => {
      const w = makeWorld(3);

      await w.returnUnitsV2(1, "buyer");
      expect(money(w.state.hold.refundedAmount)).toBe("277.33");
      await w.returnUnitsV2(1, "buyer");
      expect(money(w.state.hold.refundedAmount)).toBe("554.66");
      const third = await w.returnUnitsV2(1, "buyer");

      expect(third.retained).toBe(SHARE);
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");
      expect(w.state.hold.status).toBe(PaymentHoldStatus.held);
      expect(w.state.order.status).toBe(OrderStatus.delivered);
      expect(w.state.product.quantity).toBe(3);

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([SHARE]);
    });

    it("carrier fault on the last unit after two buyer-fault units: 48", async () => {
      const w = makeWorld(3);

      await w.returnUnitsV2(1, "buyer");
      await w.returnUnitsV2(1, "buyer");
      const third = await w.returnUnitsV2(1, "carrier");

      expect(third.retained).toBe(SHARE);
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([SHARE]);
    });

    it("carrier fault on all three: the order closes within a kurus of T and the 48 is paid", async () => {
      const w = makeWorld(3);

      const cash = [
        (await w.returnUnitsV2(1, "carrier")).cash,
        (await w.returnUnitsV2(1, "carrier")).cash,
        (await w.returnUnitsV2(1, "carrier")).cash,
      ];

      // Each third rounds down (333.33 + 20 + 10); the last adds the 60
      // outbound. The buyer gets 1149.99 of 1150: v2 has no last-unit
      // remainder (known cash-side gap, hub backlog). The order still closes
      // because the cumulative check allows MONEY_EPSILON.
      expect(cash).toEqual([363.33, 363.33, 423.33]);
      expect(w.cashRefunded()).toBeCloseTo(1149.99, 2);
      expect(w.state.order.status).toBe(OrderStatus.cancelled);
      expect(w.state.payment.status).toBe(PaymentStatus.refunded);
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");
      expect(w.state.hold.status).toBe(PaymentHoldStatus.held);

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([SHARE]);
    });

    it("seller fault on the last unit: the 0.01 rounding remainder does not stay in escrow", async () => {
      // Thirds consume 277.33 x 3 = 831.99; the residual of 0.01 is at the
      // zero threshold, so the hold is cancelled at its full amount.
      const w = makeWorld(3);

      await w.returnUnitsV2(1, "buyer");
      await w.returnUnitsV2(1, "buyer");
      await w.returnUnitsV2(1, "seller");

      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");

      await w.releaseAndPay();

      expect(w.state.payouts).toHaveLength(0);
    });
  });

  /**
   * Mixed faults, decision D20: once ANY finalized refund of the order is
   * seller fault, the seller's own shipping share goes to the platform,
   * whatever the fault of the line-completing refund and whether or not the
   * cash refunds reach T. The v2 policy emits no share, the hold retains
   * nothing, and neither release path has anything to pay or settle.
   */
  describe("mixed faults (D20: any seller fault forfeits the share)", () => {
    it("buyer fault first, seller fault last: the hold is consumed in full, nothing is paid", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "buyer");
      const second = await w.returnUnitsV2(1, "seller");

      expect(second.retained).toBe(0);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");
      // 494 + 605 < T: the order stays delivered with a consumed hold.
      expect(w.cashRefunded()).toBe(1099);
      expect(w.state.order.status).toBe(OrderStatus.delivered);

      await w.releaseAndPay();

      expect(w.state.payouts).toHaveLength(0);
    });

    it("seller fault first, carrier fault last: the order closes, the hold is consumed, the 48 stays with the platform", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "seller");
      const second = await w.returnUnitsV2(1, "carrier");

      // No seller_refund share component, so nothing is retained.
      expect(second.retained).toBe(0);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");
      // The buyer side is unchanged: 545 + 605 = T and the order closes.
      expect(w.cashRefunded()).toBe(PAYMENT_AMOUNT);
      expect(w.state.order.status).toBe(OrderStatus.cancelled);
      // No residual is left to release or to settle by hand.
      expect(w.residualSettleable()).toBe(false);

      const run = await w.releaseAndPay();

      expect(run).toEqual({ released: 0, payoutsCreated: 0 });
      expect(w.state.payouts).toHaveLength(0);
    });

    it("seller fault first, buyer fault last (cash < T): the order stays delivered and the normal release pays nothing", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "seller");
      const second = await w.returnUnitsV2(1, "buyer");

      expect(second.retained).toBe(0);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");
      // The buyer is NOT charged the forfeited share (the seller paid it from
      // the hold): 545 + 494 = 1039 < T, so the order stays delivered.
      expect(w.cashRefunded()).toBe(1039);
      expect(w.state.order.status).toBe(OrderStatus.delivered);

      await w.releaseAndPay();

      expect(w.state.payouts).toHaveLength(0);
    });

    it("a buyer-fault request decided before D20 is settled under the old rule: the buyer was charged the share, the seller gets it", async () => {
      // Decided before the deploy, finalized after it: its stored components
      // still carry seller_refund 48 AND buyer_charge 48, and the buyer's cash
      // (fixed at decision time) already has the 48 deducted. Forfeiting the
      // share here would leave the buyer charged and the seller unpaid, so
      // the platform would collect the 48 twice (QA re-check, option a).
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "seller");
      const second = await w.returnUnitsV2(1, "buyer", { policyUnaware: true });

      expect(second.retained).toBe(SHARE);
      // 545 + 446: the buyer bears the share as decided.
      expect(w.cashRefunded()).toBe(991);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.held);
      expect(money(w.state.hold.refundedAmount)).toBe("784.00");

      await w.releaseAndPay();

      const paidToSeller = w.state.payouts.reduce(
        (sum, p) => sum + Number(p.netAmount),
        0,
      );
      expect(paidToSeller).toBe(SHARE);
      // Buyer and seller together end where the D20 outcome ends (1039):
      // the share is collected once, from the buyer, and paid to the seller.
      expect(w.cashRefunded() + paidToSeller).toBe(1039);
    });

    it("a request decided before D20 WITHOUT a buyer charge of the share is still forfeited at hold consumption", async () => {
      // Carrier fault: the old components refund the seller 48 and charge
      // nobody for it, so the backstop forfeits it (seller fault earlier).
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "seller");
      const second = await w.returnUnitsV2(1, "carrier", {
        policyUnaware: true,
      });

      expect(second.retained).toBe(SHARE);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");

      await w.releaseAndPay();

      expect(w.state.payouts).toHaveLength(0);
    });

    it("three units, seller fault in the middle, buyer fault last: no share, the buyer is not charged it", async () => {
      const w = makeWorld(3);

      const first = await w.returnUnitsV2(1, "buyer");
      expect(money(w.state.hold.refundedAmount)).toBe("277.33");
      const middle = await w.returnUnitsV2(1, "seller");
      expect(money(w.state.hold.refundedAmount)).toBe("554.66");
      // The middle unit does not complete the line: no outbound legs yet.
      expect(middle.retained).toBe(0);
      const last = await w.returnUnitsV2(1, "buyer");

      // 333.33 + 20 commission - 36 return label, buyer fault, both times:
      // the completing buyer-fault refund carries no buyer_charge of the
      // forfeited share, so it is the same as the first one.
      expect([first.cash, middle.cash, last.cash]).toEqual([
        317.33, 363.33, 317.33,
      ]);
      expect(w.cashRefunded()).toBeCloseTo(997.99, 2);
      expect(last.retained).toBe(0);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");
      expect(w.state.order.status).toBe(OrderStatus.delivered);
      expect(w.residualSettleable()).toBe(false);

      const run = await w.releaseAndPay();

      expect(run).toEqual({ released: 0, payoutsCreated: 0 });
      expect(w.state.payouts).toHaveLength(0);
    });

    it("three units, seller fault in the middle, carrier fault last: no share, buyer gets the outbound back", async () => {
      const w = makeWorld(3);

      await w.returnUnitsV2(1, "buyer");
      await w.returnUnitsV2(1, "seller");
      const last = await w.returnUnitsV2(1, "carrier");

      // Carrier on the completing unit: the third + fees + the 60 outbound.
      expect(last.cash).toBe(423.33);
      expect(w.cashRefunded()).toBeCloseTo(1103.99, 2);
      expect(last.retained).toBe(0);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");
      expect(w.state.order.status).toBe(OrderStatus.delivered);

      const run = await w.releaseAndPay();

      expect(run).toEqual({ released: 0, payoutsCreated: 0 });
      expect(w.state.payouts).toHaveLength(0);
    });

    it("no seller fault on any unit: the share is still paid (the rule does not over-reach)", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "buyer");
      const second = await w.returnUnitsV2(1, "carrier");

      expect(second.retained).toBe(SHARE);

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([SHARE]);
    });
  });

  describe("idempotent re-processing", () => {
    it("replaying the line-completing refund changes no money, stock or status", async () => {
      const w = makeWorld(2);

      await w.returnUnitsV2(1, "buyer");
      const second = await w.returnUnitsV2(1, "buyer");
      const before = {
        hold: money(w.state.hold.refundedAmount),
        holdStatus: w.state.hold.status,
        cash: w.cashRefunded(),
        stock: w.state.product.quantity,
        order: w.state.order.status,
      };

      // Same request finalized again (cron + Sürat sync + admin force race).
      const replay = await w.refunds.processRefund(ORDER_ID, second.cash, {
        skipRefundEvent: true,
        refundQuantity: 1,
        idempotencyKey: `refund-request:${second.rrId}`,
        cancelledBy: CancellationActor.buyer,
        settlement: {
          closeOrder: false,
          holdPortion: 0.5,
          sellerFeeRefundAmount: 0,
          buyerFeeRefundAmount: 0,
          holdRetainedAmount: SHARE,
        },
      });

      expect(replay).toEqual(expect.objectContaining({ idempotent: true }));
      expect(w.paytr.createRefund).toHaveBeenCalledTimes(2);
      expect({
        hold: money(w.state.hold.refundedAmount),
        holdStatus: w.state.hold.status,
        cash: w.cashRefunded(),
        stock: w.state.product.quantity,
        order: w.state.order.status,
      }).toEqual(before);
      expect(w.state.attempts.map((a) => [a.idempotencyKey, a.status])).toEqual(
        [
          ["refund-request:rr-1", RefundAttemptStatus.finalized],
          ["refund-request:rr-2", RefundAttemptStatus.finalized],
        ],
      );
    });

    it("a second release and payout run after the payout pays nothing more", async () => {
      const w = makeWorld(2);
      await w.returnUnitsV2(1, "buyer");
      await w.returnUnitsV2(1, "buyer");
      await w.releaseAndPay();

      const again = await w.releaseAndPay();

      expect(again).toEqual({ released: 0, payoutsCreated: 0 });
      expect(w.state.payouts).toHaveLength(1);
    });
  });

  /**
   * v1 (`REFUND_POLICY_V2_ENABLED=false`, the emergency fallback): the share
   * comes from `compensateSellerShipping` and only on a request that covers
   * every unit. Pins of today's behaviour; see the report for the gaps.
   */
  describe("v1 policy codes", () => {
    it("buyer_remorse_return for the whole line: the order closes and the retained share is paid", async () => {
      const w = makeWorld(2);

      const all = await w.returnUnitsV1(2, "changed_mind");

      // v1 compensates the NET seller shipping (40), not the gross 48 the
      // hold deducted.
      expect(all.retained).toBe(40);
      expect(money(w.state.hold.refundedAmount)).toBe("792.00");
      expect(w.state.order.status).toBe(OrderStatus.cancelled);
      expect(w.holdBlockedReason()).toBeNull();

      await w.releaseAndPay();

      expect(w.state.payouts.map((p) => Number(p.netAmount))).toEqual([40]);
    });

    it("buyer_remorse_return one unit at a time: v1 retains nothing and the share is lost", async () => {
      const w = makeWorld(2);

      const first = await w.returnUnitsV1(1, "changed_mind");
      const second = await w.returnUnitsV1(1, "changed_mind");

      expect([first.retained, second.retained]).toEqual([0, 0]);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);
      expect(money(w.state.hold.refundedAmount)).toBe("832.00");

      await w.releaseAndPay();

      expect(w.state.payouts).toHaveLength(0);
    });

    it("seller_fault_return for the whole line: nothing retained, nothing paid", async () => {
      const w = makeWorld(2);

      const all = await w.returnUnitsV1(2, "damaged");

      expect(all.retained).toBe(0);
      expect(w.state.hold.status).toBe(PaymentHoldStatus.cancelled);

      await w.releaseAndPay();

      expect(w.state.payouts).toHaveLength(0);
    });
  });
});
