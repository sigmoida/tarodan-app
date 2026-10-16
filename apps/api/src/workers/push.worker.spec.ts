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
    const worker = new PushWorker(prisma as never, {} as never, {} as never);
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

describe("PushWorker.handleSendNotification — kuyruk yolu", () => {
  const TOKEN = "ExponentPushToken[abc]";

  const makeWorker = (opts: {
    existingRow?: { id: string } | null;
    preferredLanguage?: string;
  }) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          notificationSettings: null,
          acceptsMarketingEmails: true,
          preferredLanguage: opts.preferredLanguage ?? "tr",
        }),
      },
      pushToken: { findMany: jest.fn().mockResolvedValue([{ token: TOKEN }]) },
      notificationLog: {
        findFirst: jest.fn().mockResolvedValue(opts.existingRow ?? null),
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const expoPush = {
      unreadBadgeCount: jest.fn().mockResolvedValue(3),
      sendMessages: jest.fn().mockResolvedValue({
        sent: 1,
        failed: 0,
        deactivated: 0,
        tickets: [{ status: "ok", id: "t1" }],
      }),
    };
    const worker = new PushWorker(
      prisma as never,
      expoPush as never,
      {} as never,
    );
    return { worker, prisma, expoPush };
  };

  const job = (data: Record<string, unknown>) => ({ id: "j1", data }) as never;

  it("zil satırı mükerrerse push da GİTMEZ (B6: teklif kabulü iki push)", async () => {
    const { worker, expoPush } = makeWorker({ existingRow: { id: "r1" } });

    const res = await worker.handleSendNotification(
      job({
        userId: "u1",
        title: "x",
        body: "y",
        data: { type: "offer_received", offerId: "o1" },
      }),
    );

    expect(expoPush.sendMessages).not.toHaveBeenCalled();
    expect(res).toMatchObject({ pushSent: false });
  });

  it("satıcının 'Yeni Sipariş' push'u audience=seller + sipariş kanalı + rozet taşır (B5/B11/B12)", async () => {
    const { worker, expoPush } = makeWorker({});

    await worker.handleSendNotification(
      job({
        userId: "seller-1",
        title: "Yeni Sipariş",
        body: "gövde",
        data: { type: "payment_received", orderId: "ord-1" },
      }),
    );

    const [messages] = expoPush.sendMessages.mock.calls[0];
    expect(messages[0]).toMatchObject({
      to: TOKEN,
      channelId: "orders",
      badge: 3,
      data: { type: "payment_received", audience: "seller", orderId: "ord-1" },
    });
  });

  it("katalog kopyası ALICININ dilinde render edilir (B14)", async () => {
    const { worker, expoPush, prisma } = makeWorker({
      preferredLanguage: "en",
    });

    await worker.handleSendNotification(
      job({
        userId: "u1",
        title: "Ödeme Başarısız",
        body: "tr gövde",
        copy: {
          titleKey: "server.notificationEvent.paymentFailed.title",
          messageKey: "server.notificationEvent.paymentFailed.message",
          values: { orderNumber: "ORD-9" },
        },
        data: { type: "payment_failed", orderId: "o9" },
      }),
    );

    const [messages] = expoPush.sendMessages.mock.calls[0];
    expect(messages[0].title).toBe("Payment Failed");
    expect(messages[0].body).toBe("Payment for order ORD-9 failed.");
    expect(prisma.notificationLog.create.mock.calls[0][0].data.title).toBe(
      "Payment Failed",
    );
  });

  it("yönetici yayınında push satırı SONUÇTAN güncellenir (B13)", async () => {
    const { worker, prisma } = makeWorker({});

    await worker.handleSendNotification(
      job({
        userId: "u1",
        title: "Duyuru",
        body: "gövde",
        data: { type: "admin_broadcast", mailingType: "announcement" },
        broadcastId: "b-1",
      }),
    );

    expect(prisma.notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ["u1"] },
          channel: { in: ["push"] },
          status: "pending",
          data: { path: ["broadcastId"], equals: "b-1" },
        }),
        data: expect.objectContaining({ status: "sent" }),
      }),
    );
  });
});

describe("PushWorker.handleBroadcast — zamanlanmış satır sonuçtan yazılır", () => {
  it("dağıtım bitince satır 'sent' olur ve ilerleme kaldığı yerden sürer", async () => {
    const prisma = {
      scheduledNotification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const events = {
      runAdminBroadcastFanout: jest
        .fn()
        .mockResolvedValue({ users: 5, pushQueued: 4, emailsQueued: 0 }),
    };
    const worker = new PushWorker(
      prisma as never,
      {} as never,
      events as never,
    );
    const progress = jest.fn().mockReturnValue(2);

    await worker.handleBroadcast({
      id: "j",
      progress,
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        userIds: ["a"],
        title: "t",
        body: "b",
        channels: ["push"],
        scheduledNotificationId: "s-1",
      },
    } as never);

    expect(events.runAdminBroadcastFanout.mock.calls[0][1].startChunk).toBe(2);
    expect(prisma.scheduledNotification.updateMany).toHaveBeenCalledWith({
      where: { id: "s-1", status: "processing" },
      data: expect.objectContaining({ status: "sent", sentCount: 5 }),
    });
  });
});
