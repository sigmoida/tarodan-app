/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminPaymentService } from "./admin-payment.service";

jest.mock("../../common/helpers/fulltext-search", () => ({
  fulltextPaymentSearch: jest.fn().mockResolvedValue([]),
  fulltextOrderSearch: jest.fn().mockResolvedValue([]),
  fulltextUserSearch: jest.fn().mockResolvedValue([]),
}));

const initiator = {
  id: "user-initiator",
  displayName: "Initiator",
  email: "initiator@example.com",
};
const receiver = {
  id: "user-receiver",
  displayName: "Receiver",
  email: "receiver@example.com",
};

function tradePayment(overrides: Record<string, any> = {}): any {
  return {
    id: "payment-trade-1",
    orderId: null,
    order: null,
    checkoutGroupId: null,
    checkoutGroup: null,
    amount: 145,
    currency: "TRY",
    provider: "paytr",
    status: "completed",
    failureReason: null,
    providerPaymentId: "provider-1",
    providerConversationId: "conversation-1",
    createdAt: new Date("2026-08-11T10:00:00Z"),
    updatedAt: new Date("2026-08-11T10:05:00Z"),
    paidAt: new Date("2026-08-11T10:05:00Z"),
    tradeCashPayment: {
      id: "tcp-1",
      payerId: initiator.id,
      recipientId: receiver.id,
      amount: 50,
      tradeFeeAmount: 0,
      shippingAmount: 25,
      commission: 60,
      commissionTaxAmount: 10,
      totalAmount: 145,
      status: "completed",
      refundedAt: null,
      trade: {
        id: "trade-1",
        tradeNumber: "TKS-100",
        status: "shipping_to_warehouse",
        pricingVersion: "v1",
        firstWarehouseArrivalAt: null,
        initiator,
        receiver,
        items: [
          {
            side: "initiator",
            quantity: 1,
            valueAtTrade: 300,
            product: { id: "product-a", title: "Alpha" },
          },
          {
            side: "receiver",
            quantity: 2,
            valueAtTrade: 350,
            product: { id: "product-b", title: "Beta" },
          },
        ],
        shipments: [],
        cashPayments: [
          {
            id: "tcp-1",
            payerId: initiator.id,
            totalAmount: 145,
            shippingAmount: 25,
            status: "completed",
            releasedAt: null,
            refundedAt: null,
            payment: { status: "completed", provider: "paytr" },
          },
        ],
      },
    },
    refundAttempts: [],
    paymentHolds: [],
    ...overrides,
  };
}

describe("AdminPaymentService trade payment surfaces", () => {
  const makeService = (rows: any[] = []) => {
    const prisma: any = {
      payment: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(rows.length),
        findUnique: jest.fn(),
      },
    };
    const service = new AdminPaymentService(prisma, {} as any, {} as any);
    return { service, prisma };
  };

  it("maps a legacy trade payment to its trade reference, payer, counterparty and item sides", async () => {
    const { service } = makeService([tradePayment()]);

    const result = await service.getPayments({ page: 1, limit: 20 });

    expect(result.data[0]).toMatchObject({
      sourceType: "trade",
      reference: { type: "trade", id: "trade-1", number: "TKS-100" },
      payer: initiator,
      counterparty: receiver,
      trade: {
        pricingVersion: "v1",
        initiatorItems: [{ id: "product-a", title: "Alpha", quantity: 1 }],
        receiverItems: [{ id: "product-b", title: "Beta", quantity: 2 }],
      },
    });
  });

  it("uses the other participant as counterparty for a v2 fee-only row with no recipient", async () => {
    const row = tradePayment();
    row.amount = 65;
    row.tradeCashPayment = {
      ...row.tradeCashPayment,
      payerId: receiver.id,
      recipientId: null,
      amount: 0,
      tradeFeeAmount: 40,
      shippingAmount: 25,
      commission: 0,
      commissionTaxAmount: 0,
      totalAmount: 65,
      trade: { ...row.tradeCashPayment.trade, pricingVersion: "v2" },
    };
    const { service } = makeService([row]);

    const result = await service.getPayments({ page: 1, limit: 20 });

    expect(result.data[0].payer).toEqual(receiver);
    expect(result.data[0].counterparty).toEqual(initiator);
    expect(result.data[0].trade?.recipientId).toBeNull();
  });

  it("adds trade number, participant and product relations to payment search", async () => {
    const { service, prisma } = makeService();

    await service.getPayments({ page: 1, limit: 20, search: "Alpha" });

    const where = prisma.payment.findMany.mock.calls[0][0].where;
    const tradeCondition = (where.OR ?? []).find(
      (condition: any) => condition.tradeCashPayment,
    );
    expect(tradeCondition).toEqual({
      tradeCashPayment: {
        trade: {
          OR: expect.arrayContaining([
            {
              tradeNumber: {
                contains: "Alpha",
                mode: "insensitive",
              },
            },
            {
              items: {
                some: {
                  product: {
                    title: { contains: "Alpha", mode: "insensitive" },
                  },
                },
              },
            },
          ]),
        },
      },
    });
  });

  it("returns the current charge breakdown and whole-trade refundable exposure", async () => {
    const row = tradePayment();
    row.tradeCashPayment.trade.pricingVersion = "v2";
    row.tradeCashPayment.trade.cashPayments = [
      {
        id: "tcp-1",
        payerId: initiator.id,
        totalAmount: 145,
        shippingAmount: 25,
        status: "completed",
        releasedAt: null,
        refundedAt: null,
        payment: { status: "completed", provider: "paytr" },
      },
      {
        id: "tcp-2",
        payerId: receiver.id,
        totalAmount: 65,
        shippingAmount: 25,
        status: "completed",
        releasedAt: null,
        refundedAt: null,
        payment: { status: "completed", provider: "paytr" },
      },
      {
        id: "tcp-failed",
        payerId: receiver.id,
        totalAmount: 999,
        shippingAmount: 25,
        status: "failed",
        releasedAt: null,
        refundedAt: null,
        payment: { status: "failed", provider: "paytr" },
      },
    ];
    const { service, prisma } = makeService();
    prisma.payment.findUnique.mockResolvedValue(row);

    const result = await service.getPaymentById(row.id);

    expect(result.sourceType).toBe("trade");
    expect(result.amount).toBe(result.trade?.currentPayment.totalAmount);
    expect(result.trade).toMatchObject({
      id: "trade-1",
      payer: initiator,
      counterparty: receiver,
      refundableTotal: 210,
      currentPayment: {
        cashDifferenceAmount: 50,
        tradeFeeAmount: 0,
        shippingAmount: 25,
        legacyCommissionAmount: 60,
        legacyCommissionTaxAmount: 10,
        totalAmount: 145,
      },
    });
    expect(result.trade?.payments).toHaveLength(3);
  });

  it("uses provider eligibility and excludes shipping after cargo handoff", async () => {
    const row = tradePayment();
    row.tradeCashPayment.trade.shipments = [{ id: "shipment-1" }];
    row.tradeCashPayment.trade.cashPayments = [
      {
        id: "tcp-eligible",
        payerId: initiator.id,
        totalAmount: 145,
        shippingAmount: 25,
        status: "completed",
        releasedAt: null,
        refundedAt: null,
        payment: { status: "completed", provider: "paytr" },
      },
      {
        id: "tcp-released",
        payerId: receiver.id,
        totalAmount: 65,
        shippingAmount: 25,
        status: "completed",
        releasedAt: new Date("2026-08-11T12:00:00Z"),
        refundedAt: null,
        payment: { status: "completed", provider: "paytr" },
      },
      {
        id: "tcp-other-provider",
        payerId: receiver.id,
        totalAmount: 80,
        shippingAmount: 25,
        status: "completed",
        releasedAt: null,
        refundedAt: null,
        payment: { status: "completed", provider: "other" },
      },
    ];
    const { service, prisma } = makeService();
    prisma.payment.findUnique.mockResolvedValue(row);

    const result = await service.getPaymentById(row.id);

    expect(result.trade?.refundableTotal).toBe(120);
  });

  it("keeps an unlinked legacy payment null-safe", async () => {
    const { service } = makeService([
      {
        ...tradePayment(),
        tradeCashPayment: null,
      },
    ]);

    const result = await service.getPayments({ page: 1, limit: 20 });

    expect(result.data[0]).toMatchObject({
      sourceType: "unlinked",
      reference: null,
      payer: null,
      counterparty: null,
      trade: null,
    });
  });

  it("does not mislabel a stale payer id as the receiver", async () => {
    const row = tradePayment();
    row.tradeCashPayment.payerId = "missing-user";
    const { service } = makeService([row]);

    const result = await service.getPayments({ page: 1, limit: 20 });

    expect(result.data[0].payer).toBeNull();
    expect(result.data[0].counterparty).toBeNull();
  });
});
