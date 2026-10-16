import {
  ADMIN_BROADCAST_JOB,
  EventService,
  type AdminBroadcastPayload,
} from "./event.service";
import * as sanitizer from "../../common/helpers/email-html-sanitizer";

/**
 * Yayın iki adımdır: istek `emitAdminBroadcast` ile TEK `send-broadcast` işi
 * yazar, worker `runAdminBroadcastFanout` ile dağıtır. Testler iki adımı da
 * gerçek iş verisiyle (Redis'e yazılan JSON hâliyle) çalıştırır.
 */
describe("EventService.emitAdminBroadcast — e-posta", () => {
  const makeService = (users: Array<{ id: string; email: string }>) => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const pushQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue(users.map((u) => ({ ...u, pushTokens: [] }))),
      },
      notificationLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new EventService(
      emailQueue as never,
      pushQueue as never,
      {} as never,
      prisma as never,
      {} as never,
    );
    const emit = async (payload: AdminBroadcastPayload) => {
      await service.emitAdminBroadcast(payload);
      const call = pushQueue.add.mock.calls.find(
        ([name]) => name === ADMIN_BROADCAST_JOB,
      );
      // Redis'e yazılan hâl: JSON gidiş-dönüşü (Map taşınamazdı).
      const job = JSON.parse(JSON.stringify(call?.[1]));
      return service.runAdminBroadcastFanout(job);
    };
    return { service, emailQueue, pushQueue, prisma, emit };
  };

  const users = [
    { id: "u1", email: "izinli@example.com" },
    { id: "u2", email: "izinsiz@example.com" },
  ];

  const base = {
    userIds: ["u1", "u2"],
    title: "Duyuru",
    body: "Gövde",
    channels: ["email"],
  };

  it("duyuru: herkese gider, çıkış linki/başlığı yoktur (eski davranış)", async () => {
    const { emit, emailQueue } = makeService(users);

    await emit({ ...base });

    expect(emailQueue.add).toHaveBeenCalledTimes(2);
    for (const [, job] of emailQueue.add.mock.calls) {
      expect(job.headers).toBeUndefined();
      expect(job.html).not.toContain("abonelikten çıkabilirsiniz");
      // Eski yol: konu = push başlığı.
      expect(job.subject).toBe("Duyuru");
    }
  });

  it("HTML verilince e-posta özel konu + süzülmüş HTML ile gider", async () => {
    const { emit, emailQueue } = makeService(users);

    await emit({
      ...base,
      emailSubject: "Kampanya",
      emailHtml: "<h1>Selam</h1><script>alert(1)</script>",
    });

    const [, job] = emailQueue.add.mock.calls[0];
    expect(job.subject).toBe("Kampanya");
    expect(job.html).toContain("<h1>Selam</h1>");
    expect(job.html).not.toContain("<script");
  });

  it("pazarlama: yalnız haritadaki üyelere gider; her mail kendi çıkış linkini taşır", async () => {
    const { emit, emailQueue } = makeService(users);

    await emit({
      ...base,
      emailHtml: "<p>x</p>",
      marketingUnsubscribeTokens: new Map([["u1", "tok-1"]]),
    });

    expect(emailQueue.add).toHaveBeenCalledTimes(1);
    const [, job] = emailQueue.add.mock.calls[0];
    expect(job.to).toBe("izinli@example.com");
    expect(job.html).toContain("newsletter/unsubscribe?token=tok-1");
    expect(job.headers["List-Unsubscribe"]).toContain(
      "newsletter/unsubscribe?token=tok-1",
    );
    expect(job.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    // Mail Yönlendirme: toplu gönderim pazarlama kutusundan çıkar.
    expect(job.area).toBe("marketing");
  });

  it("pazarlama + boş harita: kimseye e-posta gitmez", async () => {
    const { emit, emailQueue } = makeService(users);

    await emit({
      ...base,
      marketingUnsubscribeTokens: new Map(),
    });

    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it("HTML alıcı sayısından bağımsız BİR kez süzülür; her mail yine süzülmüş içeriği taşır", async () => {
    const many = Array.from({ length: 5 }, (_, n) => ({
      id: `u${n}`,
      email: `u${n}@example.com`,
    }));
    const { emit, emailQueue } = makeService(many);
    const spy = jest.spyOn(sanitizer, "sanitizeEmailHtml");

    await emit({
      ...base,
      userIds: many.map((u) => u.id),
      emailHtml: "<p>Selam</p><script>alert(1)</script>",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).toHaveBeenCalledTimes(5);
    for (const [, job] of emailQueue.add.mock.calls) {
      expect(job.html).toContain("<p>Selam</p>");
      expect(job.html).not.toContain("<script");
    }
    spy.mockRestore();
  });

  it("istek içinde dağıtım YAPILMAZ: yalnız tek send-broadcast işi yazılır", async () => {
    const { service, emailQueue, pushQueue } = makeService(users);

    await service.emitAdminBroadcast({ ...base, channels: ["email", "push"] });

    expect(emailQueue.add).not.toHaveBeenCalled();
    expect(pushQueue.add).toHaveBeenCalledTimes(1);
    expect(pushQueue.add.mock.calls[0][0]).toBe(ADMIN_BROADCAST_JOB);
  });

  it("cihazı olmayan kullanıcının push satırı 'failed' olur, iş yazılmaz", async () => {
    const { emit, pushQueue, prisma } = makeService(users);

    await emit({ ...base, channels: ["push"], broadcastId: "b-1" });

    // Yalnız send-broadcast işi; kullanıcıların token'ı yok → kişi başı iş yok.
    expect(
      pushQueue.add.mock.calls.filter(([n]) => n === "send-notification"),
    ).toHaveLength(0);
    expect(prisma.notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ["u1", "u2"] },
          channel: { in: ["push"] },
          data: { path: ["broadcastId"], equals: "b-1" },
        }),
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});
