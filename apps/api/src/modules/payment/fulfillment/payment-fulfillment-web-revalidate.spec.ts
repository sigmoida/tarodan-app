import { OrderStatus } from "@prisma/client";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { notifyWebRevalidate } from "../../../common/helpers/revalidate";

jest.mock("../../../common/helpers/revalidate", () => ({
  ...jest.requireActual("../../../common/helpers/revalidate"),
  notifyWebRevalidate: jest.fn().mockResolvedValue(undefined),
}));

/**
 * A paid boost changes the order of the product lists, so after its commit
 * the API clears its own list cache and then asks the web to revalidate the
 * lists and the listing's page (`products:list`, `product:<id>`).
 *
 * Regression: only the API Redis cache was cleared; the web home kept its
 * ISR copy of the rails for up to its revalidate window. The order matters:
 * a web revalidation that ran before the API list cache was cleared would
 * fetch the stale API list again. Regular and membership orders keep their
 * behaviour (no web revalidation from this path).
 */
describe("PaymentFulfillmentService — web revalidation after a paid boost", () => {
  const notify = notifyWebRevalidate as jest.MockedFunction<
    typeof notifyWebRevalidate
  >;

  const makeOrder = (productId: string) => ({
    id: "order-1",
    orderNumber: "ORD-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId,
    quantity: 1,
    totalAmount: 59,
    isTest: false,
    status: OrderStatus.pending_payment,
    buyer: { id: "buyer-1", displayName: "Buyer" },
    seller: { id: "seller-1", displayName: "Seller" },
    product: { id: productId, title: "Listing" },
  });

  const make = (opts: { boostedProductId?: string | null } = {}) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      productBoost: { findUnique: jest.fn().mockResolvedValue(null) },
      membershipPayment: { findUnique: jest.fn().mockResolvedValue(null) },
      userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
      wishlistItem: { findMany: jest.fn().mockResolvedValue([]) },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const service = new PaymentFulfillmentService(
      prisma as never,
      cache as never,
      { get: jest.fn() } as never,
      {
        emitOrderFulfillmentRequested: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        notifyStockoutCascade: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        applyBoostInTx: jest
          .fn()
          .mockResolvedValue(
            opts.boostedProductId === undefined
              ? "listing-1"
              : opts.boostedProductId,
          ),
        applyMembershipInTx: jest.fn().mockResolvedValue(undefined),
        issueBoostInvoice: jest.fn(),
        issueMembershipInvoice: jest.fn(),
      } as never,
      {
        decrementForOrder: jest
          .fn()
          .mockResolvedValue({ cancelledOrders: [], cancelledOffers: [] }),
      } as never,
      { createInAppNotification: jest.fn().mockResolvedValue(true) } as never,
      { createHold: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        consumeReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
        releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    return { service, tx, cache };
  };

  const pay = (
    harness: ReturnType<typeof make>,
    order: ReturnType<typeof makeOrder>,
  ) => {
    harness.tx.order.findUnique
      .mockResolvedValueOnce({
        status: OrderStatus.pending_payment,
        orderNumber: order.orderNumber,
      })
      .mockResolvedValueOnce(order);
    return harness.service.processSuccessfulPayment(
      {
        id: "pay-1",
        orderId: order.id,
        order,
        status: "pending",
        metadata: {},
        provider: "paytr",
      },
      "txn-1",
    );
  };

  beforeEach(() => notify.mockClear());

  it("a paid boost revalidates the web lists and the listing page after the API list cache is cleared", async () => {
    const harness = make();

    await expect(pay(harness, makeOrder("boost-abc"))).resolves.toBe(true);

    expect(harness.cache.del).toHaveBeenCalledWith("products:detail:listing-1");
    expect(harness.cache.delPattern).toHaveBeenCalledWith("products:list:*");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(["products:list", "product:listing-1"]);
    expect(notify.mock.invocationCallOrder[0]).toBeGreaterThan(
      harness.cache.delPattern.mock.invocationCallOrder[0],
    );
  });

  it("a boost whose activation found no listing asks the web for nothing", async () => {
    const harness = make({ boostedProductId: null });

    await expect(pay(harness, makeOrder("boost-abc"))).resolves.toBe(true);

    expect(notify).not.toHaveBeenCalled();
  });

  it("a duplicate callback (payment already claimed) asks the web for nothing", async () => {
    const harness = make();
    harness.tx.payment.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(pay(harness, makeOrder("boost-abc"))).resolves.toBe(false);

    expect(notify).not.toHaveBeenCalled();
    expect(harness.cache.delPattern).not.toHaveBeenCalled();
  });

  it("a regular order keeps its behaviour: API list cache cleared, no web revalidation from this path", async () => {
    const harness = make();

    await expect(pay(harness, makeOrder("product-1"))).resolves.toBe(true);

    expect(harness.cache.delPattern).toHaveBeenCalledWith("products:list:*");
    expect(notify).not.toHaveBeenCalled();
  });

  it("a membership order touches neither the lists nor the web", async () => {
    const harness = make();

    await expect(pay(harness, makeOrder("membership-gold"))).resolves.toBe(
      true,
    );

    expect(harness.cache.delPattern).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
