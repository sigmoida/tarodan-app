import { OrderOrigin, OrderStatus } from "@prisma/client";
import { PaymentInitiationService } from "./payment-initiation.service";

/**
 * The return URL query each direct-form target builds (the PayTR service
 * appends it to both the success and the fail URL): payment id always,
 * `type` for a virtual order, `guest=true` for a guest order or cart.
 */
describe("PaymentInitiationService — direct-form return URL query", () => {
  const makeService = (opts: {
    order?: Record<string, unknown>;
    group?: Record<string, unknown>;
  }) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(opts.order ?? null) },
      checkoutGroup: {
        findUnique: jest.fn().mockResolvedValue(opts.group ?? null),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          orderId: opts.order ? "order-1" : null,
          checkoutGroupId: opts.group ? "group-1" : null,
          tradeCashPayment: null,
          status: "pending",
          providerConversationId: null,
          metadata: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: "pay-1", metadata: null }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ status: OrderStatus.pending_payment }]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const service = new PaymentInitiationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { ensureForPayment: jest.fn().mockResolvedValue(null) } as never,
      { isRecordedForOrder: jest.fn().mockResolvedValue(true) } as never,
    );
    return service;
  };

  const order = (over: Record<string, unknown> = {}) => ({
    id: "order-1",
    orderNumber: "ORD-10001",
    buyerId: "buyer-1",
    productId: "product-1",
    origin: OrderOrigin.offer,
    checkoutGroupId: null,
    status: OrderStatus.pending_payment,
    paymentExpiresAt: null,
    reservationReleasedAt: null,
    totalAmount: 250,
    shippingAddress: { fullName: "Alıcı Kişi", city: "İstanbul" },
    buyer: { id: "buyer-1", displayName: "Alıcı Kişi", email: "b@test.local" },
    product: { id: "product-1", title: "Model araba" },
    ...over,
  });

  const group = (over: Record<string, unknown> = {}) => ({
    id: "group-1",
    groupNumber: "GRP-10001",
    buyerId: "buyer-1",
    isGuest: false,
    totalAmount: 250,
    orders: [order({ checkoutGroupId: "group-1" })],
    ...over,
  });

  type Resolve = (
    userId: string | null,
    dto: Record<string, unknown>,
    req?: unknown,
    capabilityAuthorized?: boolean,
  ) => Promise<{ returnQueryParams: string }>;
  const resolveOf = (service: PaymentInitiationService): Resolve =>
    (
      service as unknown as { resolveDirectPaymentContext: Resolve }
    ).resolveDirectPaymentContext.bind(service);

  it.each([
    ["a member's offer order", order(), "paymentId=pay-1"],
    [
      "a membership order",
      order({
        origin: OrderOrigin.platform_service,
        productId: "membership-tier-1",
      }),
      "paymentId=pay-1&type=membership",
    ],
    [
      "a boost order",
      order({
        origin: OrderOrigin.platform_service,
        productId: "boost-b1",
        shippingAddress: { type: "boost", boostId: "b1" },
      }),
      "paymentId=pay-1&type=boost",
    ],
  ])("%s", async (_label, target, expected) => {
    const resolve = resolveOf(makeService({ order: target }));

    const ctx = await resolve("buyer-1", { orderId: "order-1" });

    expect(ctx.returnQueryParams).toBe(expected);
  });

  it("a guest order", async () => {
    const resolve = resolveOf(
      makeService({
        order: order({
          buyerId: "system-guest",
          shippingAddress: {
            isGuestOrder: true,
            guestEmail: "misafir@test.local",
            fullName: "Misafir",
          },
        }),
      }),
    );

    const ctx = await resolve(
      null,
      { orderId: "order-1", paymentId: "pay-1" },
      undefined,
      true,
    );

    expect(ctx.returnQueryParams).toBe("paymentId=pay-1&guest=true");
  });

  it.each([
    ["a member's cart", group(), "paymentId=pay-1"],
    [
      "a guest cart",
      group({ isGuest: true, buyerId: null }),
      "paymentId=pay-1&guest=true",
    ],
  ])("%s", async (_label, target, expected) => {
    const resolve = resolveOf(makeService({ group: target }));

    const ctx = await resolve(
      target.isGuest ? null : "buyer-1",
      { checkoutGroupId: "group-1", paymentId: "pay-1" },
      undefined,
      target.isGuest,
    );

    expect(ctx.returnQueryParams).toBe(expected);
  });
});
