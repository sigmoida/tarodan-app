import { AdminPaymentService } from "./admin-payment.service";

jest.mock("../../common/helpers/fulltext-search", () => ({
  fulltextPaymentSearch: jest.fn().mockResolvedValue([]),
  fulltextOrderSearch: jest.fn().mockResolvedValue([]),
  fulltextUserSearch: jest.fn().mockResolvedValue([]),
}));

/**
 * Admin finans yüzeylerinin grup farkındalığı:
 *  - getPayments: sepet ödemesinde grup kimliği (groupNumber/orderCount/anchor)
 *    ve alıcı checkoutGroup'tan gelir; arama grup numarasıyla da eşleşir.
 *  - getPaymentById: grubun siparişleri + ödemeye karşı iade denemeleri döner.
 *  - getRefundHistory: Payment değil RefundRequest bazlıdır (grup modelinde
 *    kısmi iadelerde Payment 'refunded' olmaz — eski kurgu grup iadelerini
 *    hiç göremiyordu).
 *  - getFailedPayments: order'sız (grup) ödemede 500 atmaz.
 */
describe("AdminPaymentService group surfaces", () => {
  const makeService = (prismaOverrides: Record<string, any> = {}) => {
    const prisma: any = {
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      refundRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      ...prismaOverrides,
    };
    const svc = Object.create(AdminPaymentService.prototype);
    (svc as any).prisma = prisma;
    return { svc: svc as AdminPaymentService, prisma };
  };

  const groupPayment = {
    id: "pay-1",
    orderId: null,
    order: null,
    checkoutGroupId: "grp-1",
    checkoutGroup: {
      id: "grp-1",
      groupNumber: "GRP-100",
      buyer: { id: "b1", displayName: "Buyer", email: "b@x.com" },
      orders: [{ id: "o1" }, { id: "o2" }],
    },
    amount: 500,
    currency: "TRY",
    provider: "paytr",
    status: "completed",
    failureReason: null,
    providerPaymentId: null,
    providerConversationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    paidAt: new Date(),
  };

  it("getPayments: sepet ödemesi grup kimliğiyle döner (alıcı gruptan, anchor ilk sipariş)", async () => {
    const { svc, prisma } = makeService();
    prisma.payment.findMany.mockResolvedValue([groupPayment]);
    prisma.payment.count.mockResolvedValue(1);

    const res = await (svc as any).getPayments({ page: 1, limit: 20 });
    const row = res.data[0];

    expect(row.groupNumber).toBe("GRP-100");
    expect(row.orderCount).toBe(2);
    expect(row.anchorOrderId).toBe("o1");
    expect(row.buyer?.displayName).toBe("Buyer");
  });

  it("getPayments: arama grup numarası ve grup alıcısıyla da eşleşir", async () => {
    const { svc, prisma } = makeService();

    await (svc as any).getPayments({ page: 1, limit: 20, search: "GRP-100" });

    const where = prisma.payment.findMany.mock.calls[0][0].where;
    const hasGroupCondition = (where.OR ?? []).some(
      (c: any) => c.checkoutGroup,
    );
    expect(hasGroupCondition).toBe(true);
  });

  it("getRefundHistory: RefundRequest bazlıdır ve iade edilen kesintiyi döner", async () => {
    const { svc, prisma } = makeService();
    prisma.refundRequest.findMany.mockResolvedValue([
      {
        id: "rr-1",
        refundNumber: "RFD-1",
        orderId: "o1",
        amount: 120,
        reason: "damaged",
        refundedSellerFeeAmount: 9.6,
        refundedAt: new Date("2026-07-20"),
        createdAt: new Date("2026-07-18"),
        order: {
          orderNumber: "ORD-1",
          commissionAmount: 12,
          buyer: { id: "b1", displayName: "Buyer", email: "b@x.com" },
          seller: { id: "s1", displayName: "Seller", email: "s@x.com" },
          product: { id: "p1", title: "Ürün" },
        },
      },
    ]);
    prisma.refundRequest.count.mockResolvedValue(1);

    const res = await (svc as any).getRefundHistory({ page: 1, limit: 20 });
    const row = res.data[0];

    expect(prisma.refundRequest.findMany).toHaveBeenCalled();
    expect(row.refundNumber).toBe("RFD-1");
    expect(row.orderNumber).toBe("ORD-1");
    expect(row.amount).toBe(120);
    expect(row.refundedSellerFee).toBe(9.6);
    expect(row.buyer?.displayName).toBe("Buyer");
  });

  it("getFailedPayments: order'sız (grup) ödemede patlamaz, grup alıcısına düşer", async () => {
    const { svc, prisma } = makeService();
    prisma.payment.findMany.mockResolvedValue([
      { ...groupPayment, status: "failed", failureReason: "declined" },
    ]);
    prisma.payment.count.mockResolvedValue(1);

    const res = await (svc as any).getFailedPayments({ page: 1, limit: 20 });

    expect(res.data[0].buyer?.displayName).toBe("Buyer");
    expect(res.data[0].orderNumber).toBe("GRP-100");
  });
});
