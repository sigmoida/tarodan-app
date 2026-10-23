import { OrderOrigin, OrderStatus } from "@prisma/client";
import { PaymentInitiationService } from "./payment-initiation.service";

/**
 * DIRECT-FORM BOOST CONSENT GATE.
 *
 * A boost order is created together with both purchase consents (one
 * transaction in `initiateBoost`). The card form is the common last step
 * before every PayTR charge, so it checks them again: a boost order without
 * them (one made before the rule) is never charged. Other orders do not
 * reach this gate.
 */
describe("PaymentInitiationService — direct-form boost consent gate", () => {
  const makeService = (order: Record<string, unknown>, recorded: boolean) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: "pay-1",
              providerConversationId: null,
              metadata: null,
              ...data,
            }),
          ),
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
    const distanceGate = jest.fn().mockResolvedValue(null);
    const platformConsent = {
      isRecordedForOrder: jest.fn().mockResolvedValue(recorded),
    };
    const service = new PaymentInitiationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { ensureForPayment: distanceGate } as never,
      platformConsent as never,
    );
    return { service, prisma, distanceGate, platformConsent };
  };

  const order = (over: Record<string, unknown> = {}) => ({
    id: "order-1",
    orderNumber: "BST-K7X9M2QF3N",
    buyerId: "seller-1",
    productId: "boost-b1",
    origin: OrderOrigin.platform_service,
    checkoutGroupId: null,
    status: OrderStatus.pending_payment,
    paymentExpiresAt: null,
    reservationReleasedAt: null,
    totalAmount: 59,
    shippingAddress: { type: "boost", boostId: "b1" },
    buyer: { id: "seller-1", displayName: "Satıcı", email: "s@test.local" },
    product: { id: "boost-b1", title: "Ekonomik — İlan Öne Çıkarma" },
    ...over,
  });

  /** The private step under test: target, gates and the charge claim. */
  const resolve = (service: PaymentInitiationService) =>
    (
      service as unknown as {
        resolveDirectPaymentContext: (
          userId: string,
          dto: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).resolveDirectPaymentContext("seller-1", { orderId: "order-1" });

  it("charges a boost order whose consents are on record", async () => {
    const { service, prisma, platformConsent, distanceGate } = makeService(
      order(),
      true,
    );

    await resolve(service);

    expect(platformConsent.isRecordedForOrder).toHaveBeenCalledWith("order-1");
    // A boost is no sale of goods: no distance sales subject.
    expect(distanceGate).toHaveBeenCalledWith(null, undefined);
    expect(prisma.payment.updateMany).toHaveBeenCalled();
  });

  it("refuses a boost order without its consents before the charge claim", async () => {
    const { service, prisma } = makeService(order(), false);

    await expect(resolve(service)).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.product.boostConsentRequired" },
    });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["a membership order", { productId: "membership-tier-1" }],
    [
      "an offer order",
      {
        productId: "product-1",
        origin: OrderOrigin.offer,
        shippingAddress: {},
      },
    ],
  ])("does not apply to %s", async (_label, over) => {
    const { service, platformConsent, prisma } = makeService(
      order(over),
      false,
    );

    await resolve(service);

    expect(platformConsent.isRecordedForOrder).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).toHaveBeenCalled();
  });
});
