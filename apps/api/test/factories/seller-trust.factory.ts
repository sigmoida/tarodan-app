import {
  CancellationActor,
  OrderOrigin,
  OrderStatus,
  Prisma,
  RatingStatus,
  RefundFaultParty,
  RefundReason,
  RefundRequestStatus,
  TradeStatus,
} from "@prisma/client";
import { getPrisma } from "../test-utils/db";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** One order of a seller trust fixture; unset fields take realistic defaults. */
export interface OrderFixture {
  sellerId: string;
  buyerId: string;
  status?: OrderStatus;
  origin?: OrderOrigin;
  /** Paid: the (current) preparing deadline. Null = never paid. */
  deadline?: Date | null;
  originalDeadline?: Date | null;
  shippedAt?: Date | null;
  completedAt?: Date | null;
  cancelledBy?: CancellationActor | null;
  cancelReason?: string | null;
  adminCancelReasonCode?: string | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  shippingAddress?: Prisma.InputJsonValue;
}

/**
 * Seller trust seed data for DB-backed specs (the nightly refresh and the
 * admin lab e2e): users, orders with shipments, ratings, trades and
 * refunds, all relative to one `asOf` so the formula windows are exact.
 * Synthetic data only. Call `reset()` after each truncate (it forgets the
 * per-seller product it reuses).
 */
export function sellerTrustFixtures(opts: {
  asOf: Date;
  /** The baseline category, re-seeded after every truncate. */
  categoryId: () => string;
}) {
  const ago = (ms: number) => new Date(opts.asOf.getTime() - ms);
  let seq = 0;
  const uniq = () => `${Date.now()}-${++seq}`;
  const products = new Map<string, string>();

  async function user(
    over: Partial<Prisma.UserUncheckedCreateInput> = {},
  ): Promise<string> {
    const u = await getPrisma().user.create({
      data: {
        email: `u-${uniq()}@test.local`,
        passwordHash: "x",
        displayName: "Trust Fixture",
        createdAt: ago(60 * DAY),
        ...over,
      },
    });
    return u.id;
  }

  async function productOf(sellerId: string): Promise<string> {
    const existing = products.get(sellerId);
    if (existing) return existing;
    const p = await getPrisma().product.create({
      data: {
        sellerId,
        categoryId: opts.categoryId(),
        title: `Trust Fixture ${uniq()}`,
        description: "fixture",
        price: new Prisma.Decimal(100),
        condition: "new" as never,
        status: "active" as never,
        quantity: 1,
        reservedQuantity: 0,
      },
    });
    products.set(sellerId, p.id);
    return p.id;
  }

  /** Defaults: a completed, on-time order paid 10 days before asOf. */
  async function order(f: OrderFixture): Promise<string> {
    const prisma = getPrisma();
    const deadline = f.deadline === undefined ? ago(10 * DAY) : f.deadline;
    const o = await prisma.order.create({
      data: {
        orderNumber: `TR-${uniq()}`,
        buyerId: f.buyerId,
        sellerId: f.sellerId,
        productId: await productOf(f.sellerId),
        origin: f.origin ?? OrderOrigin.direct_sale,
        totalAmount: new Prisma.Decimal(100),
        commissionAmount: new Prisma.Decimal(0),
        paymentExpiresAt: ago(12 * DAY),
        status: f.status ?? OrderStatus.completed,
        preparingDeadline: deadline,
        originalPreparingDeadline: f.originalDeadline ?? null,
        completedAt:
          f.completedAt === undefined
            ? (f.status ?? OrderStatus.completed) === OrderStatus.completed
              ? ago(2 * DAY)
              : null
            : f.completedAt,
        cancelledBy: f.cancelledBy ?? null,
        cancelledAt: f.cancelledAt ?? null,
        ...(f.createdAt ? { createdAt: f.createdAt } : {}),
        cancelReason: f.cancelReason ?? null,
        adminCancelReasonCode: f.adminCancelReasonCode ?? null,
        shippingAddress: f.shippingAddress,
      },
    });
    const shippedAt =
      f.shippedAt === undefined
        ? deadline &&
          (f.status ?? OrderStatus.completed) !== OrderStatus.cancelled
          ? new Date(deadline.getTime() - HOUR)
          : null
        : f.shippedAt;
    if (shippedAt) {
      await prisma.shipment.create({
        data: { orderId: o.id, provider: "surat", shippedAt },
      });
    }
    return o.id;
  }

  async function rate(
    giverId: string,
    receiverId: string,
    score: number,
    ref: { orderId?: string; tradeId?: string },
    createdAt: Date = ago(DAY),
  ) {
    await getPrisma().rating.create({
      data: {
        giverId,
        receiverId,
        score,
        status: RatingStatus.approved,
        createdAt,
        ...ref,
      },
    });
  }

  async function trade(
    initiatorId: string,
    receiverId: string,
    completedAt: Date = ago(5 * DAY),
  ): Promise<string> {
    const t = await getPrisma().trade.create({
      data: {
        tradeNumber: `TT-${uniq()}`,
        initiatorId,
        receiverId,
        status: TradeStatus.completed,
        responseDeadline: ago(20 * DAY),
        completedAt,
      },
    });
    return t.id;
  }

  async function refund(
    orderId: string,
    requesterId: string,
    faultParty: RefundFaultParty,
    status: RefundRequestStatus,
  ) {
    await getPrisma().refundRequest.create({
      data: {
        refundNumber: `RF-${uniq()}`,
        orderId,
        requesterId,
        reason: RefundReason.not_as_described,
        amount: new Prisma.Decimal(100),
        status,
        faultParty,
      },
    });
  }

  /** Plan case D: 5 buyers, each one on-time completed order and a 5-star rating. */
  async function caseD(sellerId: string) {
    for (let i = 0; i < 5; i++) {
      const buyerId = await user();
      const orderId = await order({ sellerId, buyerId });
      await rate(buyerId, sellerId, 5, { orderId });
    }
  }

  return {
    user,
    productOf,
    order,
    rate,
    trade,
    refund,
    caseD,
    reset: () => products.clear(),
  };
}
