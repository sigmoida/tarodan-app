import {
  ADMIN_BROADCAST_JOB,
  EventService,
  type AdminBroadcastJobData,
  type AdminBroadcastProgress,
} from "./event.service";
import * as sanitizer from "../../common/helpers/email-html-sanitizer";

/**
 * Yayın iki adımdır: istek `emitAdminBroadcast` ile TEK `send-broadcast` işi
 * yazar (yalnız hedefleme kuralı — kullanıcı listesi / çıkış token'ı YOK),
 * worker `runAdminBroadcastFanout` ile alıcıları veritabanından parça parça
 * çözüp dağıtır.
 */
describe("EventService admin yayını", () => {
  const makeService = (
    users: Array<{ id: string; email: string; pushTokens?: { id: string }[] }>,
  ) => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const pushQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(users.map((u) => ({ pushTokens: [], ...u })))
          .mockResolvedValue([]),
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
    const emit = async (
      payload: AdminBroadcastJobData,
      opts: Parameters<EventService["runAdminBroadcastFanout"]>[1] = {},
    ) => {
      await service.emitAdminBroadcast(payload);
      const call = pushQueue.add.mock.calls.find(
        ([name]) => name === ADMIN_BROADCAST_JOB,
      );
      // Redis'e yazılan hâl: JSON gidiş-dönüşü.
      const job = JSON.parse(JSON.stringify(call?.[1]));
      return service.runAdminBroadcastFanout(job, opts);
    };
    return { service, emailQueue, pushQueue, prisma, emit };
  };

  const users = [
    { id: "u1", email: "izinli@example.com" },
    { id: "u2", email: "izinsiz@example.com" },
  ];

  const base: AdminBroadcastJobData = {
    broadcastId: "b-1",
    title: "Duyuru",
    body: "Gövde",
    channels: ["email"],
    isMarketing: false,
    target: { targetType: "all" },
  };

  it("iş verisi kullanıcı listesi ve çıkış token'ı TAŞIMAZ; dağıtım istekte yapılmaz", async () => {
    const { service, emailQueue, pushQueue } = makeService(users);

    await service.emitAdminBroadcast({ ...base, channels: ["email", "push"] });

    expect(emailQueue.add).not.toHaveBeenCalled();
    expect(pushQueue.add).toHaveBeenCalledTimes(1);
    const [name, job, opts] = pushQueue.add.mock.calls[0];
    expect(name).toBe(ADMIN_BROADCAST_JOB);
    expect(job).not.toHaveProperty("userIds");
    expect(job).not.toHaveProperty("marketingUnsubscribeTokens");
    expect(opts.removeOnFail).toEqual({ age: expect.any(Number) });
  });

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

  it("pazarlama: çıkış token'ları dağıtım anında çözülür; yalnız token'ı olana gider", async () => {
    const { emit, emailQueue, prisma } = makeService(users);
    const resolveUnsubscribeTokens = jest
      .fn()
      .mockResolvedValue(new Map([["u1", "tok-1"]]));

    await emit(
      { ...base, isMarketing: true, emailHtml: "<p>x</p>" },
      { resolveUnsubscribeTokens },
    );

    expect(resolveUnsubscribeTokens).toHaveBeenCalledWith(["u1", "u2"]);
    // Alıcı filtresi pazarlama iznini içerir.
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      acceptsMarketingEmails: true,
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

  it("pazarlama + token yok: kimseye e-posta gitmez", async () => {
    const { emit, emailQueue } = makeService(users);

    await emit(
      { ...base, isMarketing: true },
      { resolveUnsubscribeTokens: jest.fn().mockResolvedValue(new Map()) },
    );

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

  it("kişi başı işler deterministik kimlik taşır (yeniden denenen parça çift göndermez)", async () => {
    const { emit, emailQueue, pushQueue } = makeService([
      { id: "u1", email: "a@x", pushTokens: [{ id: "t" }] },
    ]);

    await emit({ ...base, channels: ["email", "push"] });

    expect(emailQueue.add.mock.calls[0][2]).toMatchObject({
      jobId: "b-1:u1:email",
    });
    const pushCall = pushQueue.add.mock.calls.find(
      ([n]) => n === "send-notification",
    );
    expect(pushCall?.[2]).toMatchObject({ jobId: "b-1:u1:push" });
  });

  it("yeniden denemede kaldığı yerden ve BİRİKMİŞ sayaçlarla sürer", async () => {
    const { emit, prisma } = makeService([{ id: "u9", email: "z@x" }]);
    const resume: AdminBroadcastProgress = {
      lastUserId: "u5",
      users: 5,
      pushQueued: 0,
      emailsQueued: 5,
    };
    const onChunkDone = jest.fn();

    const stats = await emit({ ...base }, { resume, onChunkDone });

    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      AND: [expect.anything(), { id: { gt: "u5" } }],
    });
    expect(stats).toEqual({
      lastUserId: "u9",
      users: 6,
      pushQueued: 0,
      emailsQueued: 6,
    });
    expect(onChunkDone).toHaveBeenCalledWith(stats);
  });

  it("cihazı olmayan kullanıcının push satırı 'failed' olur, iş yazılmaz", async () => {
    const { emit, pushQueue, prisma } = makeService(users);

    await emit({ ...base, channels: ["push"] });

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
