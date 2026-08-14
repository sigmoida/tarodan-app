import { NotFoundException } from "@nestjs/common";
import { AdminAnalyticsOrderService } from "../analytics/admin-analytics-order.service";

/**
 * Admin "grup dosyası": GET /admin/orders/:id/file — sipariş id'sinden grup
 * çatısına çözülen tek payload. Amaç: adminin "tek çekimde ne ödendi, hangi
 * siparişleri kapsıyor, sipariş başına kesintiler (stopaj/KDV dahil), gerçek
 * escrow hold'u, iade talepleri" zincirini TEK ekrandan okuyabilmesi.
 */
describe("AdminAnalyticsOrderService.getOrderGroupFile", () => {
  const common = {
    resolveProductImageUrl: (key?: string | null) =>
      key ? `img:${key}` : null,
  } as any;

  const makeService = () => {
    const prisma: any = {
      order: { findUnique: jest.fn(), findMany: jest.fn() },
      checkoutGroup: { findUnique: jest.fn() },
      paymentHold: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new AdminAnalyticsOrderService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      common,
    );
    return { svc, prisma };
  };

  const baseOrder = (id: string, over: Record<string, any> = {}) => ({
    id,
    orderNumber: `ORD-${id}`,
    buyerId: "buyer-1",
    sellerId: "sA",
    checkoutGroupId: "grp-1",
    packageId: "pkg-A",
    status: "delivered",
    quantity: 2,
    unitPrice: 100,
    subtotal: 200,
    totalAmount: 245,
    shippingCost: 30,
    buyerShippingAmount: 30,
    sellerShippingAmount: 10,
    commissionAmount: 25,
    buyerFeeAmount: 15,
    buyerCommissionAmount: 10,
    buyerServiceFeeAmount: 5,
    sellerFeeAmount: 10,
    sellerCommissionAmount: 8,
    sellerPlatformFeeAmount: 2,
    taxAmount: 12,
    withholdingTaxAmount: 2,
    discountAmount: 0,
    discountCode: null,
    platformFundedDiscount: 0,
    cancellationType: null,
    cancelReason: null,
    createdAt: new Date("2026-07-01"),
    deliveredAt: new Date("2026-07-03"),
    completedAt: null,
    confirmationDeadline: null,
    buyerConfirmedAt: null,
    shippingAddress: null,
    buyer: {
      id: "buyer-1",
      displayName: "Buyer",
      email: "b@x.com",
      phone: null,
      isVerified: true,
    },
    seller: {
      id: "sA",
      displayName: "A Store",
      email: "a@x.com",
      sellerType: "individual",
      isVerified: true,
    },
    product: {
      id: "p1",
      title: "Ürün 1",
      images: [{ cardKey: "k1" }],
    },
    package: {
      id: "pkg-A",
      sellerId: "sA",
      shippingCost: 30,
      fullShippingAmount: 40,
      buyerShippingAmount: 30,
      sellerShippingAmount: 10,
      billableDesi: 3,
    },
    shipment: {
      id: "sh-1",
      provider: "surat",
      status: "delivered",
      trackingNumber: "ORD-o1",
      providerTrackingId: "SURAT-1",
      shippedAt: new Date("2026-07-02"),
      deliveredAt: new Date("2026-07-03"),
    },
    refundRequests: [
      {
        id: "rr-1",
        refundNumber: "REF-1",
        status: "approved",
        reason: "damaged",
        amount: 100,
        refundQuantity: 1,
        createdAt: new Date("2026-07-04"),
        refundedAt: null,
      },
    ],
    commissionLedger: {
      status: "earned",
      sellerCommission: 8,
      buyerFee: 15,
      refundedSellerCommission: 0,
      refundedBuyerFee: 0,
    },
    ...over,
  });

  it("gruplu sipariş: paket başına satıcı+kargo, sipariş başına tam finans (stopaj/KDV dahil), gerçek hold ve iade talepleri", async () => {
    const { svc, prisma } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: "o1",
      checkoutGroupId: "grp-1",
    });
    prisma.checkoutGroup.findUnique.mockResolvedValue({
      id: "grp-1",
      groupNumber: "GRP-100",
      totalAmount: 500,
      createdAt: new Date("2026-07-01"),
      payment: {
        id: "pay-1",
        status: "completed",
        amount: 500,
        provider: "paytr",
        providerPaymentId: "pp-1",
        paidAt: new Date("2026-07-01"),
        refundAttempts: [
          { status: "finalized", amount: 100 },
          { status: "failed", amount: 50 },
        ],
      },
    });
    prisma.order.findMany.mockResolvedValue([
      baseOrder("o1"),
      baseOrder("o2", {
        sellerId: "sB",
        packageId: "pkg-B",
        seller: {
          id: "sB",
          displayName: "B Store",
          email: "bb@x.com",
          sellerType: "business",
          isVerified: false,
        },
        package: {
          id: "pkg-B",
          sellerId: "sB",
          shippingCost: 0,
          fullShippingAmount: 30,
          buyerShippingAmount: 0,
          sellerShippingAmount: 30,
          billableDesi: 1,
        },
        refundRequests: [],
        commissionLedger: null,
      }),
    ]);
    prisma.paymentHold.findMany.mockResolvedValue([
      {
        id: "hold-1",
        orderId: "o1",
        amount: 180,
        status: "held",
        releaseAt: new Date("2026-07-18"),
        releasedAt: null,
        refundedAmount: 0,
        frozenByRefundId: "rr-1",
      },
    ]);

    const file = await svc.getOrderGroupFile("o1");

    // Grup başlığı + ödeme (iade toplamı yalnız succeeded/finalized denemelerden)
    expect(file.group.kind).toBe("group");
    expect(file.group.groupNumber).toBe("GRP-100");
    expect(file.group.itemCount).toBe(2);
    expect(file.group.isMultiSeller).toBe(true);
    expect(file.payment?.amount).toBe(500);
    expect(file.payment?.coversWholeGroup).toBe(true);
    expect(file.payment?.refundedTotal).toBe(100);

    // Paketler satıcı başına; kargo kırılımı OrderPackage'tan
    expect(file.packages).toHaveLength(2);
    const pkgA = file.packages.find((p: any) => p.packageId === "pkg-A");
    if (!pkgA?.seller || !pkgA.shipment)
      throw new Error("pkg-A missing seller or shipment in the group file");
    expect(pkgA.seller.email).toBe("a@x.com");
    expect(pkgA.shipping.fullShippingAmount).toBe(40);
    expect(pkgA.shipping.buyerShippingAmount).toBe(30);
    expect(pkgA.shipping.sellerShippingAmount).toBe(10);
    expect(pkgA.shipment.providerTrackingId).toBe("SURAT-1");

    // Sipariş dosyası: tam finans + hold + iade + ledger
    const o1 = pkgA.orders[0];
    expect(o1.quantity).toBe(2);
    expect(o1.unitPrice).toBe(100);
    expect(o1.finance.withholdingTaxAmount).toBe(2);
    expect(o1.finance.taxAmount).toBe(12);
    expect(o1.finance.sellerCommissionAmount).toBe(8);
    expect(o1.finance.buyerServiceFeeAmount).toBe(5);
    expect(o1.escrow?.amount).toBe(180);
    expect(o1.escrow?.frozenByRefundId).toBe("rr-1");
    expect(o1.refundRequests).toHaveLength(1);
    expect(o1.refundRequests[0].refundQuantity).toBe(1);
    expect(o1.ledger?.status).toBe("earned");

    // Diğer paketin siparişinde hold yok → escrow null
    const pkgB = file.packages.find((p: any) => p.packageId === "pkg-B");
    if (!pkgB) throw new Error("pkg-B missing from the group file");
    expect(pkgB.orders[0].escrow).toBeNull();
  });

  it("grupsuz sipariş: sentetik tek paketlik dosya; ödeme order.payment'tan, kargo kırılımı sipariş kolonlarından", async () => {
    const { svc, prisma } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: "o9",
      checkoutGroupId: null,
    });
    prisma.order.findMany.mockResolvedValue([
      baseOrder("o9", {
        checkoutGroupId: null,
        packageId: null,
        package: null,
        payment: {
          id: "pay-9",
          status: "completed",
          amount: 245,
          provider: "paytr",
          providerPaymentId: null,
          paidAt: new Date("2026-07-01"),
          refundAttempts: [],
        },
      }),
    ]);

    const file = await svc.getOrderGroupFile("o9");

    expect(file.group.kind).toBe("synthetic");
    expect(file.group.groupNumber).toBe("ORD-o9");
    expect(file.group.itemCount).toBe(1);
    expect(file.payment?.id).toBe("pay-9");
    expect(file.payment?.coversWholeGroup).toBe(false);
    expect(file.packages).toHaveLength(1);
    // Paket meta yok → kırılım sipariş kolonlarından türetilir
    expect(file.packages[0].shipping.buyerShippingAmount).toBe(30);
    expect(file.packages[0].shipping.sellerShippingAmount).toBe(10);
  });

  it("sipariş yoksa NotFound", async () => {
    const { svc, prisma } = makeService();
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(svc.getOrderGroupFile("nope")).rejects.toThrow(
      NotFoundException,
    );
  });
});
