import { Prisma, OrderStatus, PaymentHoldStatus } from "@prisma/client";
import { PrismaService } from "../../src/prisma";
import { PaymentHoldReleaseService } from "../../src/modules/payment/refund/payment-hold-release.service";
import { PaymentService } from "../../src/modules/payment/payment.service";
import { NotificationService } from "../../src/modules/notification/notification.service";
import { OrderTrackingSyncService } from "../../src/modules/surat-cargo/order-tracking-sync.service";
import { SuratTrackingClient } from "../../src/modules/surat-cargo/surat-tracking.client";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";

/**
 * #83 + #84 — Sürat teslim poll'u escrow release'ini planlar (satıcı ödenir) VE
 * doğru referansla (trackingNumber = OzelKargoTakipNo) sorgular.
 *
 * NestJS app bootstrap edilmiyor (hızlı + ES/Docker bağımlılığı yok). SuratTrackingService
 * gerçek PaymentHoldReleaseService-destekli bir PaymentService facade ile ModuleRef üzerinden
 * beslenir; fetchTrackingInfo mock'lanıp Sürat "teslim" cevabı döndürülür ve sorgu
 * referansı yakalanır. [P0]
 */
describe("Surat poll delivery → escrow release (#83/#84) [P0]", () => {
  let prisma: PrismaService;
  let paymentRefund: PaymentHoldReleaseService;
  let surat: OrderTrackingSyncService;
  let suratClient: SuratTrackingClient;
  let capturedRefs: string[];

  const configStub = {
    get: (k: string) =>
      (
        ({
          RETURN_WINDOW_DAYS: "14",
          PAYOUT_GRACE_DAYS: "1",
          PAYMENT_HOLD_DAYS: "7",
          FEATURE_48H_CONFIRMATION_WINDOW: "false",
          SURAT_KARGO_CARI_KODU: "x",
          SURAT_KARGO_SIFRE: "x",
        }) as Record<string, string>
      )[k],
  };

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;

    paymentRefund = new PaymentHoldReleaseService(
      prisma,
      configStub as any,
      {} as any, // eventService
      {} as any, // notificationService
    );

    // ModuleRef stub: poll PaymentService/NotificationService'i lazy resolve eder.
    const paymentFacade = {
      handleOrderDelivered: (orderId: string, deliveredAt: Date, tx?: any) =>
        paymentRefund.handleOrderDelivered(orderId, deliveredAt, tx),
    };
    const moduleRefStub = {
      get: (token: any) => {
        if (token === PaymentService) return paymentFacade;
        if (token === NotificationService)
          return { notifyOrderDeliveredConfirm: async () => {} };
        return undefined;
      },
    };
    // Sürat poll logic moved from SuratTrackingService (now a thin delegate) into
    // OrderTrackingSyncService(prisma, moduleRef, client). fetchTrackingInfo now
    // lives on the SuratTrackingClient, so we spy on the client below.
    suratClient = new SuratTrackingClient(configStub as any);
    surat = new OrderTrackingSyncService(
      prisma,
      moduleRefStub as any,
      suratClient,
    );
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
    capturedRefs = [];
    // Sürat HTTP'sini by-pass et: teslim cevabı döndür + sorgu referansını yakala.
    jest
      .spyOn(suratClient as any, "fetchTrackingInfo")
      .mockImplementation(async (...args: any[]) => {
        capturedRefs.push(args[0] as string);
        return {
          IsError: false,
          errorMessage: null,
          Gonderiler: [
            {
              KargonunDurumuSayi: 6, // delivered
              KargonunDurumu: "Teslim Edildi",
              KargoTakipNo: "SURAT-KTN-1",
              TakipUrl: "https://takip/x",
              TeslimAlan: "Alici",
              // 20 gün önce teslim → releaseAt = teslim+15g geçmişte → cron release eder.
              TeslimTarihi: new Date(
                Date.now() - 20 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              PlanlananTeslimTarihi: "",
              Hareketler: [],
            },
          ],
        };
      });
  });

  async function setupAutoCreatedShipment(): Promise<{
    orderId: string;
    shipmentId: string;
    orderNumber: string;
    holdId: string;
  }> {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const buyer = await prisma.user.create({
      data: {
        email: `b-${uniq}@test.local`,
        passwordHash: "x",
        displayName: "Buyer",
      },
    });
    const seller = await prisma.user.create({
      data: {
        email: `s-${uniq}@test.local`,
        passwordHash: "x",
        displayName: "Seller",
        isSeller: true,
      },
    });
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category!.id,
        title: `P-${uniq}`,
        description: "x",
        price: new Prisma.Decimal(100),
        condition: "new" as any,
        status: "active" as any,
        quantity: 1,
        reservedQuantity: 0,
      },
    });
    const orderNumber = `O-${uniq}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        buyerId: buyer.id,
        sellerId: seller.id,
        productId: product.id,
        totalAmount: new Prisma.Decimal(100),
        subtotal: new Prisma.Decimal(100),
        commissionAmount: new Prisma.Decimal(10),
        buyerFeeAmount: new Prisma.Decimal(5),
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.shipped,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "test",
        amount: order.totalAmount,
        status: "completed" as any,
      },
    });
    // Kanonik oto-oluşturulan shipment: trackingNumber = orderNumber, providerTrackingId = null.
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        provider: "surat",
        status: "in_transit" as any,
        trackingNumber: orderNumber,
        providerTrackingId: null,
      },
    });
    // Ödeme anındaki hold: releaseAt = null (teslim olmadan asla ödenmez).
    const hold = await prisma.paymentHold.create({
      data: {
        paymentId: payment.id,
        orderId: order.id,
        sellerId: seller.id,
        amount: new Prisma.Decimal(85),
        status: PaymentHoldStatus.held,
        releaseAt: null,
      },
    });
    return {
      orderId: order.id,
      shipmentId: shipment.id,
      orderNumber,
      holdId: hold.id,
    };
  }

  it("poll teslimde: trackingNumber ile sorgular (orderId UUID değil) + releaseAt planlar (#83/#84)", async () => {
    const { orderId, shipmentId, orderNumber, holdId } =
      await setupAutoCreatedShipment();

    const ok = await surat.syncShipmentTracking(shipmentId);
    expect(ok).toBe(true);

    // #84: Sürat sorgusu orderNumber (=OzelKargoTakipNo) ile yapıldı, iç UUID ile DEĞİL.
    expect(capturedRefs).toEqual([orderNumber]);
    expect(capturedRefs[0]).not.toBe(orderId);

    // #83: order teslim + deliveredAt yazıldı, hold.releaseAt ARTIK dolu.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe(OrderStatus.delivered);
    expect(order!.deliveredAt).not.toBeNull();

    const hold = await prisma.paymentHold.findUnique({ where: { id: holdId } });
    expect(hold!.releaseAt).not.toBeNull(); // eski bug: null kalıp satıcı hiç ödenmezdi
  });

  it("teslim sonrası releaseHoldsDue satıcı hold'unu serbest bırakır (para akar)", async () => {
    const { shipmentId, holdId } = await setupAutoCreatedShipment();
    await surat.syncShipmentTracking(shipmentId);

    const res = await paymentRefund.releaseHoldsDue();
    expect(res.count).toBeGreaterThanOrEqual(1);

    const hold = await prisma.paymentHold.findUnique({ where: { id: holdId } });
    expect(hold!.status).toBe(PaymentHoldStatus.released);
    expect(hold!.releasedAt).not.toBeNull();
  });

  it("re-poll idempotent: ikinci teslim çağrısı deliveredAt/releaseAt taşımaz", async () => {
    const { orderId, shipmentId, holdId } = await setupAutoCreatedShipment();

    await surat.syncShipmentTracking(shipmentId);
    const order1 = await prisma.order.findUnique({ where: { id: orderId } });
    const hold1 = await prisma.paymentHold.findUnique({
      where: { id: holdId },
    });

    await surat.syncShipmentTracking(shipmentId); // replay
    const order2 = await prisma.order.findUnique({ where: { id: orderId } });
    const hold2 = await prisma.paymentHold.findUnique({
      where: { id: holdId },
    });

    expect(order2!.deliveredAt!.getTime()).toBe(order1!.deliveredAt!.getTime());
    expect(hold2!.releaseAt!.getTime()).toBe(hold1!.releaseAt!.getTime());
  });
});
