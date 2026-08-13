import { PushWorker } from "./push.worker";
import { NotificationType } from "../modules/notification/dto";
import { NotificationCommerceService } from "../modules/notification/notification-commerce.service";

/**
 * Push worker'ın 60 dk mükerrer filtresi ile dispatch yolunun sözleşmesi.
 *
 * Regresyon: OFFER_ACCEPTED / OFFER_RECEIVED hem dispatch yolundan
 * (notification.service) hem push kuyruğundan (event.service) yazılıyor.
 * Filtre anahtarını ÖNCE `offerId`dan türetir; dispatch satırları offerId
 * taşımadığı için kuyruk yolunun satırı filtreye TAKILMIYOR ve zil + push
 * çiftleniyordu. Dispatch emisyonları artık offerId taşır — bu suite iki ucun
 * aynı anahtarda buluştuğunu sabitler.
 */
describe("PushWorker — teklif bildirimi mükerrer filtresi", () => {
  const makeWorker = (existingRow: { id: string } | null) => {
    const prisma = {
      notificationLog: {
        findFirst: jest.fn().mockResolvedValue(existingRow),
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
      },
    };
    const worker = new PushWorker(
      { get: jest.fn().mockReturnValue("") } as never,
      prisma as never,
    );
    return { worker, prisma };
  };

  /** event.service'in kuyruğa koyduğu OFFER_ACCEPTED payload'ının data'sı. */
  const queueData = {
    type: "offer_accepted",
    offerId: "offer-1",
    orderId: "order-1",
    orderNumber: "ORD-1",
  };

  it("anahtar ÖNCE offerId'dan türetilir (orderId'den değil)", async () => {
    const { worker, prisma } = makeWorker(null);

    await (worker as any).saveInAppNotification(
      "buyer-1",
      "Teklif Kabul Edildi!",
      "gövde",
      queueData,
    );

    expect(prisma.notificationLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "buyer-1",
          channel: "in_app",
          type: "offer_accepted",
          data: { path: ["offerId"], equals: "offer-1" },
        }),
      }),
    );
    // Eşleşen satır yok → kayıt normal yazılır.
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
  });

  it("dispatch yolunun yazdığı satır varken kuyruk yolu İKİNCİ satır yazmaz", async () => {
    const { worker, prisma } = makeWorker({ id: "dispatch-row" });

    await (worker as any).saveInAppNotification(
      "buyer-1",
      "Teklif Kabul Edildi!",
      "gövde",
      queueData,
    );

    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it("dispatch emisyonu kuyruk payload'ıyla AYNI offerId anahtarını taşır", async () => {
    // İki ucun sözleşmesi: notifyOfferAccepted'ın data'sı offerId içermezse
    // yukarıdaki filtre sorgusu (path: ["offerId"]) dispatch satırını asla
    // bulamaz. Gerçek üreticiden geçen payload doğrulanır.
    const send = jest.fn().mockResolvedValue(undefined);
    const commerce = new NotificationCommerceService(
      { send } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await commerce.notifyOfferAccepted(
      "buyer-1",
      "product-1",
      1000,
      "order-1",
      "Ürün",
      queueData.offerId,
    );

    const dto = send.mock.calls[0][0];
    expect(dto.type).toBe(NotificationType.OFFER_ACCEPTED);
    expect(dto.data.offerId).toBe(queueData.offerId);
  });
});
