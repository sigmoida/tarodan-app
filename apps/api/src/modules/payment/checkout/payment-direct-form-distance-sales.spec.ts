import { BadRequestException } from "@nestjs/common";
import { OrderOrigin, OrderStatus } from "@prisma/client";
import { PaymentInitiationService } from "./payment-initiation.service";

/**
 * DIRECT-FORM MESAFELİ SATIŞ KAPISI.
 *
 * Teklif siparişinin checkout adımı yoktur: alıcının mesafeli satış onayını
 * verdiği TEK ekran ödeme sayfasıdır ve o sayfa yalnız direct-form'u çağırır.
 * Önceden onay kutusu işaretleniyor ama sunucuya hiç gitmiyordu. Kapı, her
 * satın almanın PayTR çekiminden önceki ortak son adımında durur; satın alma
 * olmayan hedefler (üyelik / öne çıkarma, takas ücreti) kapıya girmez.
 */
describe("PaymentInitiationService — direct-form mesafeli satış kapısı", () => {
  const makeService = (
    order: Record<string, unknown>,
    gate: jest.Mock = jest.fn().mockResolvedValue("record"),
  ) => {
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) =>
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
    };
    const service = new PaymentInitiationService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { ensureForPayment: gate } as never,
    );
    return { service, prisma, gate };
  };

  const offerOrder = (over: Record<string, unknown> = {}) => ({
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
    buyer: {
      id: "buyer-1",
      displayName: "Alıcı Kişi",
      email: "b@test.local",
    },
    product: { id: "product-1", title: "Model araba" },
    ...over,
  });

  const resolve = (
    service: PaymentInitiationService,
    dto: Record<string, unknown>,
  ) => (service as any).resolveDirectPaymentContext("buyer-1", dto);

  it("teklif siparişinde ödeme sayfasındaki onayı siparişe bağlı kapıya iletir", async () => {
    const { service, gate } = makeService(offerOrder());

    await resolve(service, { orderId: "order-1", distanceSalesAccepted: true });

    expect(gate).toHaveBeenCalledWith(
      { orderId: "order-1", userId: "buyer-1", guestEmail: null },
      true,
    );
  });

  it("onay gönderilmezse kapıya undefined gider (karar ayara kalır)", async () => {
    const { service, gate } = makeService(offerOrder());

    await resolve(service, { orderId: "order-1" });

    expect(gate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1" }),
      undefined,
    );
  });

  it("kapı reddederse ödeme satırı `processing`e CLAIM edilmez", async () => {
    const reject = jest
      .fn()
      .mockRejectedValue(
        new BadRequestException("server.consent.distanceSalesRequired"),
      );
    const { service, prisma } = makeService(offerOrder(), reject);

    await expect(
      resolve(service, { orderId: "order-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it("üyelik / öne çıkarma (platform hizmeti) satın alma değildir: konu null", async () => {
    const { service, gate } = makeService(
      offerOrder({
        origin: OrderOrigin.platform_service,
        productId: "membership-tier-1",
      }),
    );

    await resolve(service, { orderId: "order-1" });

    expect(gate).toHaveBeenCalledWith(null, undefined);
  });

  it("misafir siparişinde konu sistem hesabı değil misafir e-postasıdır", async () => {
    const { service, prisma, gate } = makeService(
      offerOrder({
        buyerId: "system-guest",
        shippingAddress: {
          isGuestOrder: true,
          guestEmail: "misafir@test.local",
          fullName: "Misafir",
        },
      }),
    );
    // Misafir ödeme yetkisi (capability) mevcut ödeme satırına bağlıdır.
    prisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      orderId: "order-1",
      checkoutGroupId: null,
      tradeCashPayment: null,
      status: "pending",
      providerConversationId: null,
      metadata: null,
    });

    await (service as any).resolveDirectPaymentContext(
      null,
      { orderId: "order-1", paymentId: "pay-1", distanceSalesAccepted: true },
      undefined,
      true,
    );

    expect(gate).toHaveBeenCalledWith(
      { orderId: "order-1", userId: null, guestEmail: "misafir@test.local" },
      true,
    );
  });
});
