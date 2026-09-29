import {
  CancellationActor,
  OrderCancellationReason,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundReason,
  RefundRequestStatus,
  SellerType,
  ShipmentStatus,
  ShippingPackageTierCode,
} from "@prisma/client";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundCreationService } from "./refund-creation.service";

/**
 * Kargo öncesi iptalin ORTAK çekirdeği (executePreShipmentCancellation) —
 * alıcı iptali ve admin (platform) iptali aynı para yolundan geçer. Gerçek
 * finansal servisle koşar: iade tutarları uçtan uca sabitlenir.
 *
 * Sipariş: ürün 1000, alıcı hizmet bedeli 50, alıcı kargo payı 130, satıcı
 * kargo payı 40 (koli 170), satıcı komisyonu 40 + platform bedeli 60, KDV 0.
 * Toplam tahsilat 1180.
 */
describe("RefundCreationService — kargo öncesi iptal çekirdeği", () => {
  const previousV2Flag = process.env.REFUND_POLICY_V2_ENABLED;
  beforeEach(() => {
    delete process.env.REFUND_POLICY_V2_ENABLED;
  });
  afterAll(() => {
    if (previousV2Flag === undefined) {
      delete process.env.REFUND_POLICY_V2_ENABLED;
    } else {
      process.env.REFUND_POLICY_V2_ENABLED = previousV2Flag;
    }
  });

  const baseOrder = {
    id: "order-1",
    orderNumber: "ORD-1001",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: OrderStatus.paid as OrderStatus,
    totalAmount: 1180,
    subtotal: 1000,
    taxAmount: 0,
    buyerServiceTaxAmount: 0,
    serviceVatRate: 0,
    quantity: 1,
    shippingCost: 130,
    buyerShippingAmount: 130,
    sellerShippingAmount: 40,
    buyerFeeAmount: 50,
    buyerServiceFeeAmount: 50,
    sellerFeeAmount: 100,
    sellerCommissionAmount: 40,
    sellerPlatformFeeAmount: 60,
    payment: { status: PaymentStatus.completed } as {
      status: PaymentStatus;
    } | null,
    checkoutGroupId: null as string | null,
    checkoutGroup: null as { payment: { status: PaymentStatus } } | null,
    shipment: null as {
      status: ShipmentStatus;
      shippedAt: Date | null;
      deliveredAt: Date | null;
    } | null,
    refundRequests: [] as Array<{ status: RefundRequestStatus }>,
    packageId: "package-1",
    package: {
      id: "package-1",
      shippingTariffId: "tariff-1",
      shippingTariffVersion: 3,
      billableDesi: 2,
      fullShippingAmount: 170,
      buyerShippingAmount: 130,
      sellerShippingAmount: 40,
    },
    product: {
      shippingDesi: 2,
      shippingPackageTier: ShippingPackageTierCode.small,
    },
    seller: { sellerType: SellerType.individual as SellerType },
    version: 1,
    updatedAt: new Date("2026-09-22T00:00:00.000Z"),
  };
  type TestOrder = typeof baseOrder;

  const makeService = (
    overrides: Partial<TestOrder> = {},
    opts: {
      /** Paketteki diğer canlı (iptal/iade edilmemiş) sipariş sayısı. */
      liveSiblings?: number;
      processRefund?: jest.Mock;
    } = {},
  ) => {
    const order = { ...baseOrder, ...overrides };
    const createdRows: any[] = [];
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue(order),
        count: jest.fn().mockResolvedValue(opts.liveSiblings ?? 0),
      },
      refundRequest: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const row = {
            id: `refund-${createdRows.length + 1}`,
            createdAt: new Date("2026-09-22T00:00:00.000Z"),
            updatedAt: new Date("2026-09-22T00:00:00.000Z"),
            ...data,
          };
          createdRows.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const row = createdRows.find((item) => item.id === where.id);
          return Promise.resolve(row ? { ...row, order } : null);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const row = createdRows.find((item) => item.id === where.id);
          if (row) Object.assign(row, data);
          return Promise.resolve({
            ...row,
            financialComponents: row?.financialComponents ?? [],
          });
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          const row = createdRows.find((item) => item.id === where.id);
          if (!row || row.policyFinalizedAt)
            return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        }),
      },
      refundFinancialComponent: {
        createMany: jest.fn().mockImplementation(({ data }: any) => {
          const row = createdRows.find(
            (item) => item.id === data[0]?.refundRequestId,
          );
          if (row) row.financialComponents = data;
          return Promise.resolve({ count: data.length });
        }),
      },
      packageShippingSettlement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      elogoInvoice: { findUnique: jest.fn().mockResolvedValue(null) },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      adminUser: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: order.id }]),
    };
    prisma.$transaction = jest.fn((callback: any) => callback(prisma));
    const shippingTariff = {
      getById: jest.fn().mockResolvedValue({
        id: "tariff-1",
        version: 3,
        provider: "surat",
        packageTiers: flatPackageTiers(170),
      }),
      getActiveOutboundTariff: jest.fn().mockResolvedValue({
        id: "return-tariff-1",
        version: 4,
        provider: "surat",
        packageTiers: flatPackageTiers(180),
      }),
    };
    const payment = {
      processRefund:
        opts.processRefund ??
        jest.fn().mockResolvedValue({ providerRefundId: "paytr-1" }),
    };
    const notification = {
      createInAppNotification: jest.fn().mockResolvedValue(undefined),
      sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
      notifyCouponReturned: jest.fn().mockResolvedValue(undefined),
      notifyOrderCancelledParties: jest.fn().mockResolvedValue(undefined),
    };
    const discount = {
      revokeUsageForOrders: jest.fn().mockResolvedValue({
        restoredCoupons: [],
      }),
    };
    const notifications = new RefundNotificationService(
      prisma,
      notification as any,
      {} as any,
    );
    const financials = new RefundFinancialService(
      prisma,
      notification as any,
      shippingTariff as any,
      discount as any,
    );
    const creation = new RefundCreationService(
      prisma,
      payment as any,
      notifications,
      financials,
      {} as any,
    );
    return {
      creation,
      prisma,
      payment,
      notification,
      discount,
      createdRows,
      order,
    };
  };

  const componentNet = (
    row: any,
    code: string,
    treatment: string,
  ): number | undefined =>
    (row.financialComponents ?? []).find(
      (component: any) =>
        component.componentCode === code && component.treatment === treatment,
    )?.netAmount;

  describe("alıcı iptali (davranış korunur)", () => {
    it("caymada koruma bedelini tutar, kalan her şeyi iade eder", async () => {
      const { creation, payment, notification, discount, createdRows } =
        makeService();

      const result = await creation.createCancellationRefund(
        "order-1",
        "buyer-1",
        OrderCancellationReason.changed_mind,
        "  Vazgeçtim  ",
      );

      expect(createdRows[0]).toMatchObject({
        requesterId: "buyer-1",
        reason: RefundReason.changed_mind,
        resolvedReason: RefundReason.changed_mind,
        faultParty: "buyer",
        policyCode: "v2_buyer_cancellation",
        description: "Vazgeçtim",
        amount: 1130,
        status: RefundRequestStatus.refunded,
        decidedBy: "system",
        metadata: expect.objectContaining({
          cancellationActor: CancellationActor.buyer,
        }),
      });
      expect(
        componentNet(createdRows[0], "buyer_platform_fee", "platform_retain"),
      ).toBe(50);
      expect(payment.processRefund).toHaveBeenCalledWith(
        "order-1",
        1130,
        expect.objectContaining({
          skipRefundEvent: true,
          refundQuantity: 1,
          idempotencyKey: "refund-request:refund-1",
          cancelledBy: CancellationActor.buyer,
          settlement: expect.objectContaining({
            closeOrder: true,
            holdPortion: 1,
          }),
        }),
      );
      // Kusur alıcıda: kupon hakkı yanar.
      expect(discount.revokeUsageForOrders).not.toHaveBeenCalled();
      // Alıcı kendisi iptal etti: duyuru YALNIZ satıcıya ("kargoya vermeyin").
      expect(notification.notifyOrderCancelledParties).toHaveBeenCalledTimes(1);
      expect(notification.notifyOrderCancelledParties).toHaveBeenCalledWith(
        expect.objectContaining({ id: "order-1", sellerId: "seller-1" }),
        1130,
        ["seller"],
      );
      expect(result.status).toBe(RefundRequestStatus.refunded);
      expect(createdRows[0].metadata.history).toEqual([
        expect.objectContaining({
          action: "cancellation_refunded",
          by: "system",
          details: { reasonCode: OrderCancellationReason.changed_mind },
        }),
      ]);
    });

    it("gecikmede kusur satıcıdadır: alıcı her kalemi geri alır", async () => {
      const { creation, payment, createdRows } = makeService();

      await creation.createCancellationRefund(
        "order-1",
        "buyer-1",
        OrderCancellationReason.delivery_delayed,
      );

      expect(createdRows[0]).toMatchObject({
        reason: RefundReason.other,
        resolvedReason: RefundReason.delivery_delayed,
        faultParty: "seller",
        amount: 1180,
      });
      expect(payment.processRefund).toHaveBeenCalledWith(
        "order-1",
        1180,
        expect.anything(),
      );
    });

    it("siparişe iptal nedenini ve açıklamayı yazar, sonra İPTAL tipini", async () => {
      const { creation, prisma } = makeService();

      await creation.createCancellationRefund(
        "order-1",
        "buyer-1",
        OrderCancellationReason.wrong_card,
      );

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: expect.objectContaining({
          cancellationReasonCode: OrderCancellationReason.wrong_card,
          cancelReason: OrderCancellationReason.wrong_card,
        }),
      });
      expect(prisma.order.update).toHaveBeenLastCalledWith({
        where: { id: "order-1" },
        data: { cancellationType: "iptal" },
      });
    });

    it("başkasının siparişini iptal ettirmez", async () => {
      const { creation, payment } = makeService();

      await expect(
        creation.createCancellationRefund(
          "order-1",
          "someone-else",
          OrderCancellationReason.changed_mind,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(payment.processRefund).not.toHaveBeenCalled();
    });
  });

  describe("platform (admin) iptali — aynı çekirdek", () => {
    it("alıcıya ödediği her kalemi iade eder; talep alıcı adına, karar admin'in", async () => {
      const { creation, payment, createdRows, prisma } = makeService();

      const result = await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "  Satıcı stoğu bitti  ",
      );

      expect(createdRows[0]).toMatchObject({
        requesterId: "buyer-1",
        reason: RefundReason.other,
        resolvedReason: RefundReason.other,
        faultParty: "platform",
        policyCode: "v2_platform_cancellation",
        description: "Satıcı stoğu bitti",
        amount: 1180,
        status: RefundRequestStatus.refunded,
        decidedBy: "admin-1",
        providerRefundId: "paytr-1",
        // Sonradan onay/kurtarma yolları aktörü buradan okur.
        metadata: expect.objectContaining({
          cancellationActor: CancellationActor.platform,
        }),
      });
      expect(result.amount).toBe(1180);
      // Bileşenler: ürün + hizmet bedeli + gidiş kargosu alıcıya; satıcı
      // kesintileri ve kendi kargo payı satıcıya.
      expect(componentNet(createdRows[0], "product", "buyer_refund")).toBe(
        1000,
      );
      expect(
        componentNet(createdRows[0], "buyer_platform_fee", "buyer_refund"),
      ).toBe(50);
      expect(
        componentNet(createdRows[0], "outbound_shipping", "buyer_refund"),
      ).toBe(130);
      expect(
        componentNet(createdRows[0], "outbound_shipping", "seller_refund"),
      ).toBe(40);
      expect(
        componentNet(createdRows[0], "seller_commission", "seller_refund"),
      ).toBe(40);
      expect(
        componentNet(createdRows[0], "seller_platform_fee", "seller_refund"),
      ).toBe(60);

      expect(payment.processRefund).toHaveBeenCalledWith("order-1", 1180, {
        skipRefundEvent: true,
        refundQuantity: 1,
        idempotencyKey: "refund-request:refund-1",
        // Sipariş Tarodan'ın iptali olarak kapanır.
        cancelledBy: CancellationActor.platform,
        settlement: expect.objectContaining({
          closeOrder: true,
          holdPortion: 1,
          buyerPlatformFeeRefundAmount: 50,
          sellerCommissionRefundAmount: 40,
          sellerPlatformFeeRefundAmount: 60,
          // Taşıma doğmadı: satıcının peşin ödediği kargo payı hold'da kalır.
          holdRetainedAmount: 40,
          sellerAdjustments: [],
        }),
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: expect.objectContaining({
          cancellationReasonCode: null,
          cancelReason: "Satıcı stoğu bitti",
        }),
      });
      expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { frozenByRefundId: "refund-1" } }),
      );
    });

    it("kupon hakkını geri verir (kusur alıcıda değil)", async () => {
      const { creation, discount } = makeService();

      await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "Hata",
      );

      expect(discount.revokeUsageForOrders).toHaveBeenCalledWith(
        ["order-1"],
        "refund:other:platform",
        expect.anything(),
      );
    });

    it("para commit edildikten sonra alıcıya VE satıcıya iptal duyurusu gönderir", async () => {
      const { creation, notification, createdRows } = makeService();

      await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "Hata",
      );

      expect(notification.notifyOrderCancelledParties).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "order-1",
          orderNumber: "ORD-1001",
          buyerId: "buyer-1",
          sellerId: "seller-1",
        }),
        1180,
        ["buyer", "seller"],
      );
      expect(createdRows[0].metadata.history).toEqual([
        expect.objectContaining({
          action: "cancellation_refunded",
          by: "admin-1",
          details: { initiator: "platform", reason: "Hata" },
        }),
      ]);
    });

    it("sepet (grup ödemesi) kalemini iptal eder — ödeme grupta", async () => {
      const { creation, payment } = makeService({
        payment: null,
        checkoutGroupId: "group-1",
        checkoutGroup: { payment: { status: PaymentStatus.completed } },
      });

      await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "Hata",
      );

      expect(payment.processRefund).toHaveBeenCalledWith(
        "order-1",
        1180,
        expect.objectContaining({ idempotencyKey: "refund-request:refund-1" }),
      );
    });

    it("paketin SON canlı kalemi: gidiş kargosu iadeye dahil", async () => {
      const { creation, createdRows, prisma } = makeService(
        {},
        { liveSiblings: 0 },
      );

      await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "Hata",
      );

      expect(createdRows[0].amount).toBe(1180);
      expect(prisma.packageShippingSettlement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          packageId: "package-1",
          leg: "outbound",
          payer: "platform",
        }),
      });
    });

    it("paketin diğer kalemleri hâlâ gidecekse kargo iade EDİLMEZ", async () => {
      const { creation, createdRows, payment, prisma } = makeService(
        {},
        { liveSiblings: 1 },
      );

      await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "Hata",
      );

      expect(createdRows[0].amount).toBe(1050);
      expect(
        componentNet(createdRows[0], "outbound_shipping", "buyer_refund"),
      ).toBeUndefined();
      expect(prisma.packageShippingSettlement.create).not.toHaveBeenCalled();
      expect(payment.processRefund).toHaveBeenCalledWith(
        "order-1",
        1050,
        expect.objectContaining({
          settlement: expect.objectContaining({ holdRetainedAmount: 0 }),
        }),
      );
    });

    it("yalnız etiketi oluşturulmuş (label_created) kargo iptali engellemez", async () => {
      const { creation, payment } = makeService({
        status: OrderStatus.preparing,
        shipment: {
          status: ShipmentStatus.label_created,
          shippedAt: null,
          deliveredAt: null,
        },
      });

      await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "Hata",
      );

      // Kargo iptali processRefund'ın closeOrder yolunda OUTBOX_SHIPMENT_CANCEL
      // ile kuyruğa alınır.
      expect(payment.processRefund).toHaveBeenCalledWith(
        "order-1",
        1180,
        expect.objectContaining({
          settlement: expect.objectContaining({ closeOrder: true }),
        }),
      );
    });

    it.each([
      ["kargoda", { status: OrderStatus.shipped }],
      ["teslim edilmiş", { status: OrderStatus.delivered }],
      ["zaten iptal", { status: OrderStatus.cancelled }],
      ["ödeme bekleyen", { status: OrderStatus.pending_payment }],
      [
        "koli taşıyıcıda",
        {
          status: OrderStatus.preparing,
          shipment: {
            status: ShipmentStatus.picked_up,
            shippedAt: null,
            deliveredAt: null,
          },
        },
      ],
      [
        "shippedAt mühürlü",
        {
          status: OrderStatus.paid,
          shipment: {
            status: ShipmentStatus.label_created,
            shippedAt: new Date("2026-09-21T09:00:00.000Z"),
            deliveredAt: null,
          },
        },
      ],
      ["ödeme tamamlanmamış", { payment: { status: PaymentStatus.pending } }],
      [
        "açık iade talebi",
        {
          refundRequests: [{ status: RefundRequestStatus.pending_review }],
        },
      ],
    ])("%s → reddedilir, talep açılmaz, para çıkmaz", async (_, overrides) => {
      const { creation, payment, prisma } = makeService(
        overrides as Partial<TestOrder>,
      );

      await expect(
        creation.createPlatformCancellationRefund("order-1", "admin-1", "Hata"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.refundRequest.create).not.toHaveBeenCalled();
      expect(payment.processRefund).not.toHaveBeenCalled();
    });

    it("kilit altında statü değiştiyse (satıcı az önce kargoladı) talep açılmaz", async () => {
      const { creation, prisma, payment } = makeService();
      prisma.order.findUnique
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce({
          status: OrderStatus.shipped,
          shipment: { status: ShipmentStatus.picked_up, shippedAt: new Date() },
        });

      await expect(
        creation.createPlatformCancellationRefund("order-1", "admin-1", "Hata"),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.refund.orderStatusChanged" },
      });
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.refundRequest.create).not.toHaveBeenCalled();
      expect(payment.processRefund).not.toHaveBeenCalled();
    });

    it("eşzamanlı ikinci iptal aktif-talep tekil indeksine takılır; ikinci iade yok", async () => {
      const { creation, prisma, payment } = makeService();
      prisma.refundRequest.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "5.7.1",
        }),
      );

      await expect(
        creation.createPlatformCancellationRefund("order-1", "admin-1", "Hata"),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.refund.alreadyActive" },
      });
      expect(payment.processRefund).not.toHaveBeenCalled();
    });

    it("PSP iadesi reddedilirse talep incelemeye düşer, duyuru gitmez", async () => {
      const failure = new BadRequestException({
        i18nKey: "server.payment.paytrRefundFailed",
      });
      const { creation, createdRows, notification, prisma } = makeService(
        {},
        { processRefund: jest.fn().mockRejectedValue(failure) },
      );

      await expect(
        creation.createPlatformCancellationRefund("order-1", "admin-1", "Hata"),
      ).rejects.toBe(failure);
      expect(createdRows[0]).toMatchObject({
        status: RefundRequestStatus.pending_review,
        financialReviewRequired: true,
      });
      expect(notification.notifyOrderCancelledParties).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { cancellationType: "iptal" } }),
      );
    });
  });

  describe("önizleme = iptalin yazdığı tutar (tek hesap)", () => {
    it.each([
      [0, 1180, true],
      [1, 1050, false],
    ])(
      "paketteki diğer canlı kalem %i → %d TL (kargo dahil: %s)",
      async (liveSiblings, amount, shippingRefunded) => {
        const preview = await makeService(
          {},
          { liveSiblings },
        ).creation.previewPlatformCancellationRefund("order-1");
        const { creation, createdRows } = makeService({}, { liveSiblings });
        await creation.createPlatformCancellationRefund(
          "order-1",
          "admin-1",
          "Hata",
        );

        expect(preview).toEqual({ refundAmount: amount, shippingRefunded });
        expect(createdRows[0].amount).toBe(preview.refundAmount);
      },
    );

    it("v1'e acil dönüşte de platform politikası tam iade verir", async () => {
      process.env.REFUND_POLICY_V2_ENABLED = "false";
      const preview =
        await makeService().creation.previewPlatformCancellationRefund(
          "order-1",
        );
      const { creation, createdRows, payment } = makeService();
      await creation.createPlatformCancellationRefund(
        "order-1",
        "admin-1",
        "Hata",
      );

      expect(preview).toEqual({ refundAmount: 1180, shippingRefunded: true });
      expect(createdRows[0]).toMatchObject({
        policyCode: "platform_cancellation",
        amount: 1180,
        refundedBuyerProtectionAmount: 50,
        refundedOutboundShippingAmount: 130,
        sellerShippingCompensationAmount: 40,
      });
      expect(payment.processRefund).toHaveBeenCalledWith(
        "order-1",
        1180,
        expect.anything(),
      );
    });
  });
});
