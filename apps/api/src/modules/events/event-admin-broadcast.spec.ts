import { EventService } from "./event.service";

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
    };
    const service = new EventService(
      emailQueue as never,
      pushQueue as never,
      {} as never,
      prisma as never,
      {} as never,
    );
    return { service, emailQueue };
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
    const { service, emailQueue } = makeService(users);

    await service.emitAdminBroadcast({ ...base });

    expect(emailQueue.add).toHaveBeenCalledTimes(2);
    for (const [, job] of emailQueue.add.mock.calls) {
      expect(job.headers).toBeUndefined();
      expect(job.html).not.toContain("abonelikten çıkabilirsiniz");
      // Eski yol: konu = push başlığı.
      expect(job.subject).toBe("Duyuru");
    }
  });

  it("HTML verilince e-posta özel konu + süzülmüş HTML ile gider", async () => {
    const { service, emailQueue } = makeService(users);

    await service.emitAdminBroadcast({
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
    const { service, emailQueue } = makeService(users);

    await service.emitAdminBroadcast({
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
  });

  it("pazarlama + boş harita: kimseye e-posta gitmez", async () => {
    const { service, emailQueue } = makeService(users);

    await service.emitAdminBroadcast({
      ...base,
      marketingUnsubscribeTokens: new Map(),
    });

    expect(emailQueue.add).not.toHaveBeenCalled();
  });
});
