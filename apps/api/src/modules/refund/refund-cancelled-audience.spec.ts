import { RefundRequestStatus } from "@prisma/client";
import { NotificationType } from "../notification/dto/notification.dto";
import { resolveWebNotificationLink } from "../notification/notification-link";
import { RefundService } from "./refund.service";

/**
 * REFUND_CANCELLED iki YÖNE gider ve hedef ekran audience'tan seçilir.
 *
 * Regresyon: harita sabit alıcı deseni taşıyordu (`/profile/orders/:id`).
 * Alıcı kendi talebini geri çektiğinde bildirim SATICIYA gidiyor ama satıcı
 * alıcının sipariş ekranına deep-link'leniyordu. Üretici artık kime
 * gönderdiğini `audience` ile söyler; payload uçtan uca gerçek hedefe çözülür.
 */
describe("RefundService — REFUND_CANCELLED hedef kitlesi", () => {
  const rr = {
    id: "refund-1",
    refundNumber: "RFD-1",
    requesterId: "buyer-1",
    status: RefundRequestStatus.pending_review,
    order: { id: "order-1", sellerId: "seller-1" },
  };

  const makeService = () => {
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue({ ...rr }),
        update: jest.fn().mockResolvedValue({ ...rr }),
      },
    };
    const service = new RefundService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service as any, "unfreezeHoldForRefund")
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, "appendHistory").mockResolvedValue(undefined);
    const safeNotify = jest
      .spyOn(service as any, "safeNotify")
      .mockResolvedValue(undefined);
    return { service, safeNotify };
  };

  it("alıcı talebini iptal edince SATICI kendi ekranına yönlendirilir", async () => {
    const { service, safeNotify } = makeService();

    await service.cancelRefundRequest("refund-1", "buyer-1");

    expect(safeNotify).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.REFUND_CANCELLED,
      expect.objectContaining({ audience: "seller", orderId: "order-1" }),
    );
    const data = safeNotify.mock.calls[0][2] as Record<string, unknown>;
    expect(
      resolveWebNotificationLink(NotificationType.REFUND_CANCELLED, data),
    ).toBe("/seller/orders/order-1");
  });

  it("admin kapatınca ALICI kendi sipariş ekranına yönlendirilir", async () => {
    const { service, safeNotify } = makeService();

    await service.adminCloseRefundRequest("refund-1", "admin-1", "gerekçe");

    expect(safeNotify).toHaveBeenCalledWith(
      "buyer-1",
      NotificationType.REFUND_CANCELLED,
      expect.objectContaining({ audience: "buyer", orderId: "order-1" }),
    );
    const data = safeNotify.mock.calls[0][2] as Record<string, unknown>;
    expect(
      resolveWebNotificationLink(NotificationType.REFUND_CANCELLED, data),
    ).toBe("/profile/orders/order-1");
  });
});
