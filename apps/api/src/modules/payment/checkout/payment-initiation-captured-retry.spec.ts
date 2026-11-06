import { PaymentStatus, Prisma } from "@prisma/client";
import { PaymentInitiationService } from "./payment-initiation.service";
import { singlePaymentChargeStub } from "../installments/installment-charge.testing";

/**
 * The initiate retry paths reset a non-completed payment row (status and, for
 * orders and carts, `amount`) before a new card form. A row captured through
 * a charge attempt was PAID, even when its status moved on (refunded): its
 * `chargedAmount` is tied to `amount` by a DB CHECK, and its attempt link is
 * final. The service refuses it with "already paid" instead of letting the
 * reset fail in the database (ADR 0019, A4).
 */
describe("PaymentInitiationService — retry of a payment captured through an attempt", () => {
  const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

  function setup(existing: Record<string, unknown> | null) {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(existing),
      },
    };
    const paymentCommon = {
      logPaymentAction: jest.fn(),
      assignMerchantOid: jest.fn(),
    };
    const service = new PaymentInitiationService(
      prisma as never,
      { get: () => undefined } as never,
      {} as never,
      {} as never,
      paymentCommon as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      singlePaymentChargeStub() as never,
    );
    return { service, prisma };
  }

  /** The two private retry paths under test. */
  type RetryPaths = {
    processGroupPaymentInitiation: (
      g: unknown,
      dto: unknown,
    ) => Promise<unknown>;
    processPaymentInitiation: (o: unknown, dto: unknown) => Promise<unknown>;
  };
  const paths = (service: PaymentInitiationService) =>
    service as unknown as RetryPaths;

  const group = {
    id: "grp-1",
    groupNumber: "GRP-1",
    totalAmount: D("1000.00"),
    buyerId: "buyer-1",
    orders: [{ id: "o-1", reservationReleasedAt: null }],
  };
  const order = {
    id: "o-1",
    orderNumber: "ORD-1",
    buyerId: "buyer-1",
    offerId: null,
    reservationReleasedAt: null,
    totalAmount: D("1000.00"),
  };

  const captured = {
    id: "pay-1",
    status: PaymentStatus.refunded,
    chargeAttemptId: "att-1",
    amount: D("1000.00"),
  };

  it("refuses to reset a refunded cart payment that was captured", async () => {
    const { service, prisma } = setup(captured);
    await expect(
      paths(service).processGroupPaymentInitiation(group, {
        checkoutGroupId: "grp-1",
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.payment.orderGroupAlreadyPaid" },
    });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("resets a failed cart payment only while it is uncaptured (CAS)", async () => {
    const { service, prisma } = setup({
      ...captured,
      status: PaymentStatus.failed,
      chargeAttemptId: null,
    });
    await paths(service).processGroupPaymentInitiation(group, {
      checkoutGroupId: "grp-1",
    });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "pay-1",
          status: { not: PaymentStatus.completed },
          chargeAttemptId: null,
        },
      }),
    );
  });

  it("refuses to reset a refunded order payment that was captured", async () => {
    const { service, prisma } = setup(captured);
    await expect(
      paths(service).processPaymentInitiation(order, { orderId: "o-1" }),
    ).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.payment.orderAlreadyPaid" },
    });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("resets a failed order payment with a CAS and refuses when it was captured in between", async () => {
    const { service, prisma } = setup({
      ...captured,
      status: PaymentStatus.failed,
      chargeAttemptId: null,
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      paths(service).processPaymentInitiation(order, { orderId: "o-1" }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.orderAlreadyPaid" },
    });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "pay-1",
        status: { not: PaymentStatus.completed },
        chargeAttemptId: null,
      },
      data: expect.objectContaining({
        status: PaymentStatus.pending,
        amount: D("1000.00"),
      }),
    });
  });
});
