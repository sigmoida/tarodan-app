import { NotificationType } from "./dto";
import { resolveWebNotificationLink } from "./notification-link";
import { NotificationCommerceService } from "./notification-commerce.service";
import { EventService } from "../events/event.service";
import { PaymentExpiryReconciliationService } from "../payment/reconciliation/payment-expiry-reconciliation.service";
import { OrderStatus } from "@prisma/client";

/**
 * Hedef kitleyi ÜRETİCİ bildirir.
 *
 * Regresyon: resolver `audience` yoksa alıcıyı varsayıyordu; satıcıya giden
 * bildirim sessizce alıcının ekranını açıyordu. Varsayılan kalktı — bu testler
 * gerçek üreticilerin `audience` gönderdiğini ve payload'ın uçtan uca gerçek
 * bir hedefe çözüldüğünü sabitler. Yalnız "alan var mı" değil, o alanla
 * ÜRETİLEN LİNK doğrulanır.
 */

/** Üreticinin gönderdiği payload gerçek bir hedefe çözülmeli. */
const linkOf = (type: NotificationType, data: Record<string, unknown>) =>
  resolveWebNotificationLink(type, data);

describe("bildirim üreticileri hedef kitleyi taşır", () => {
  describe("sipariş tamamlama (commerce servisi)", () => {
    const dispatchOf = () => {
      const send = jest.fn().mockResolvedValue(undefined);
      const service = new NotificationCommerceService(
        { send } as never,
        {} as never,
        {} as never,
      );
      return { send, service };
    };

    it("otomatik tamamlama: alıcı ve satıcı AYRI ekrana gider", async () => {
      const { send, service } = dispatchOf();
      await service.notifyOrderAutoCompleted("u-buyer", "o1", "buyer");
      await service.notifyOrderAutoCompleted("u-seller", "o1", "seller");

      const [buyerCall, sellerCall] = send.mock.calls.map((c) => c[0]);
      expect(buyerCall.data.audience).toBe("buyer");
      expect(sellerCall.data.audience).toBe("seller");
      expect(
        linkOf(NotificationType.ORDER_AUTO_COMPLETED, buyerCall.data),
      ).toBe("/profile/orders/o1");
      expect(
        linkOf(NotificationType.ORDER_AUTO_COMPLETED, sellerCall.data),
      ).toBe("/seller/orders/o1");
    });

    it("yönetici zorla tamamlama: alıcı ve satıcı AYRI ekrana gider", async () => {
      const { send, service } = dispatchOf();
      await service.notifyOrderForceCompletedByAdmin(
        "u-buyer",
        "o1",
        "buyer",
        "gerekçe",
      );
      await service.notifyOrderForceCompletedByAdmin(
        "u-seller",
        "o1",
        "seller",
        "gerekçe",
      );

      const [buyerCall, sellerCall] = send.mock.calls.map((c) => c[0]);
      // `reason` audience'ın YERİNE geçmemeli (imza sırası değişti).
      expect(buyerCall.data.reason).toBe("gerekçe");
      expect(
        linkOf(NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN, buyerCall.data),
      ).toBe("/profile/orders/o1");
      expect(
        linkOf(
          NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN,
          sellerCall.data,
        ),
      ).toBe("/seller/orders/o1");
    });

    it("satıcı onayı satıcı ekranına gider", async () => {
      const { send, service } = dispatchOf();
      await service.notifyOrderManuallyConfirmed("u-seller", "o1");
      expect(
        linkOf(
          NotificationType.ORDER_MANUALLY_CONFIRMED,
          send.mock.calls[0][0].data,
        ),
      ).toBe("/seller/orders/o1");
    });
  });

  describe("hazırlık süresi uyarısı (satıcıya)", () => {
    it("satıcının sipariş ekranını açar", async () => {
      const createInAppNotification = jest.fn().mockResolvedValue(true);
      const order = {
        id: "o1",
        orderNumber: "ORD-1",
        sellerId: "u-seller",
        preparingDeadline: new Date("2026-01-02T00:00:00.000Z"),
        product: { id: "p1", title: "Ürün" },
        seller: { id: "u-seller", email: "s@x.com", displayName: "S" },
      };
      const prisma = {
        order: {
          findMany: jest
            .fn()
            // Faz 1: uyarılacak siparişler. Faz 2 (iptal) boş dönsün.
            .mockResolvedValueOnce([order])
            .mockResolvedValue([]),
          update: jest.fn().mockResolvedValue(order),
        },
      };
      const service = new PaymentExpiryReconciliationService(
        prisma as never,
        {} as never,
        { get: () => undefined } as never,
        { createInAppNotification } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const result = await service.handleExpiredPreparingOrders();
      expect(result.warned).toBe(1);

      const [userId, type, data] = createInAppNotification.mock.calls[0];
      expect(userId).toBe("u-seller");
      expect(type).toBe(NotificationType.ORDER_PREPARING_DEADLINE_WARNING);
      // Satıcıya gidiyor: alıcının ekranı açılmamalı.
      expect(linkOf(type, data)).toBe("/seller/orders/o1");
    });
  });

  describe("ödeme olayları (EventService → push kuyruğu)", () => {
    const eventServiceWith = () => {
      const push = { add: jest.fn().mockResolvedValue(undefined) };
      const email = { add: jest.fn().mockResolvedValue(undefined) };
      const service = new EventService(
        email as never,
        push as never,
        { add: jest.fn() } as never,
        {} as never,
        { emit: jest.fn() } as never,
      );
      return { push, service };
    };

    /** Kuyruğa giden `send-notification` işlerinin `data` alanları. */
    const pushPayloads = (push: { add: jest.Mock }) =>
      push.add.mock.calls
        .filter((call) => call[0] === "send-notification")
        .map((call) => call[1].data);

    it("iade: alıcı ve satıcı AYRI ekrana gider", async () => {
      const { push, service } = eventServiceWith();
      await service.emitPaymentRefunded({
        orderId: "o1",
        orderNumber: "ORD-1",
        buyerId: "u-buyer",
        sellerId: "u-seller",
        buyerEmail: "b@x.com",
        buyerName: "B",
        sellerName: "S",
        refundAmount: 10,
        totalAmount: 10,
      } as never);

      const [buyer, seller] = pushPayloads(push);
      expect(buyer.type).toBe("payment_refunded");
      expect(linkOf(NotificationType.PAYMENT_REFUNDED, buyer)).toBe(
        "/profile/orders/o1",
      );
      expect(linkOf(NotificationType.PAYMENT_REFUNDED, seller)).toBe(
        "/seller/orders/o1",
      );
    });

    /**
     * Sepet ödemesi tek `checkoutGroupId` gönderiyordu; hedef üretilemiyor,
     * bildirim linksiz kalıyordu. Temsilci sipariş artık payload'da.
     */
    it("grup ödemesi: temsilci siparişin detayını açar", async () => {
      const { push, service } = eventServiceWith();
      await service.emitGroupBuyerOrderPaid({
        checkoutGroupId: "g1",
        groupNumber: "GRP-1",
        buyerId: "u-buyer",
        buyerEmail: "b@x.com",
        buyerName: "B",
        groupTotal: 100,
        paymentMethod: "paytr",
        transactionId: "tx1",
        items: [{ productTitle: "Ürün", totalAmount: 100 }],
        shippingAddress: {
          fullName: "B",
          phone: "",
          address: "",
          city: "",
          district: "",
          zipCode: "",
        },
        representativeOrderNumber: "ORD-1",
        representativeOrderId: "o1",
      });

      const [group] = pushPayloads(push);
      expect(group.type).toBe("payment_confirmed");
      expect(linkOf(NotificationType.PAYMENT_CONFIRMED, group)).toBe(
        "/profile/orders/o1",
      );
    });

    it("grup ödemesi: temsilci sipariş yoksa listeye düşer, linksiz kalmaz", async () => {
      const { push, service } = eventServiceWith();
      await service.emitGroupBuyerOrderPaid({
        checkoutGroupId: "g1",
        groupNumber: "GRP-1",
        buyerId: "u-buyer",
        buyerEmail: "b@x.com",
        buyerName: "B",
        groupTotal: 100,
        paymentMethod: "paytr",
        transactionId: "tx1",
        items: [{ productTitle: "Ürün", totalAmount: 100 }],
        shippingAddress: {
          fullName: "B",
          phone: "",
          address: "",
          city: "",
          district: "",
          zipCode: "",
        },
      });

      const [group] = pushPayloads(push);
      expect(linkOf(NotificationType.PAYMENT_CONFIRMED, group)).toBe(
        "/profile/orders",
      );
    });

    it("tekil ödeme: siparişin kendi detayını açar", async () => {
      const { push, service } = eventServiceWith();
      await service.emitOrderPaid({
        orderId: "o9",
        orderNumber: "ORD-9",
        buyerId: "u-buyer",
        sellerId: "u-seller",
        buyerEmail: "b@x.com",
        buyerName: "B",
        sellerEmail: "s@x.com",
        sellerName: "S",
        productTitle: "Ürün",
        totalAmount: 100,
        commissionAmount: 10,
        paymentMethod: "paytr",
        shippingAddress: {},
      } as never);

      const buyerPush = pushPayloads(push).find(
        (d) => d.type === "payment_confirmed",
      );
      // Tekil ödemede liste fallback'ine DÜŞMEMELİ.
      expect(linkOf(NotificationType.PAYMENT_CONFIRMED, buyerPush)).toBe(
        "/profile/orders/o9",
      );
    });
  });

  it("OrderStatus.preparing enum'u mevcut (şema kayması koruması)", () => {
    expect(OrderStatus.preparing).toBeDefined();
  });
});
