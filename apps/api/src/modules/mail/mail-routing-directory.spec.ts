import {
  MailRoutingDirectory,
  MAIL_ROUTING_CACHE_TTL_MS,
  senderAccountFingerprint,
} from "./mail-routing-directory";
import {
  MAIL_DISPLAY_NAME_MAX_LENGTH,
  isValidMailDisplayName,
} from "@tarodan/types";
import {
  formatMailFrom,
  isValidMailAddress,
  mailEventsOfArea,
  parseInternalRecipients,
  parseMailEventStates,
} from "./helpers/mail-area-settings";

const account = {
  id: "acc-1",
  address: "siparis@tarodan.com.tr",
  displayName: "Tarodan Sipariş",
  host: null,
  port: null,
  secure: null,
  username: "siparis@tarodan.com.tr",
  passwordEncrypted: "v1:x",
  lastTestOk: null,
};

describe("mail-area-settings — hoşgörülü okuma", () => {
  it("alıcıları küçük harf + tekil + geçerli olarak okur", () => {
    expect(
      parseInternalRecipients([
        " Serhat@Tarodan.com.tr ",
        "serhat@tarodan.com.tr",
        "not-an-email",
        42,
        "bad\r\nBcc: x@y.z",
      ]),
    ).toEqual(["serhat@tarodan.com.tr"]);
    expect(parseInternalRecipients(null)).toEqual([]);
  });

  it("olay listesi alanın TÜM olaylarını kayıt sırasıyla verir; eksik/bozuk = kapalı + anlık", () => {
    const states = parseMailEventStates("trade", {
      "trade.disputed": { enabled: true, delivery: "daily" },
      "trade.started": { enabled: "yes", delivery: "weekly" },
      "order.paid": { enabled: true, delivery: "hourly" },
    });

    expect(states).toEqual([
      { id: "trade.started", enabled: false, delivery: "instant" },
      { id: "trade.disputed", enabled: true, delivery: "daily" },
    ]);
    expect(mailEventsOfArea("account")).toEqual([]);
  });

  it("misafir mesajı varsayılan olarak AÇIK + anlık; diğer olaylar kapalı", () => {
    expect(parseMailEventStates("guestMessage", null)).toEqual([
      { id: "support.guestMessage", enabled: true, delivery: "instant" },
    ]);
    // Admin açıkça kapatabilir.
    expect(
      parseMailEventStates("guestMessage", {
        "support.guestMessage": { enabled: false, delivery: "daily" },
      }),
    ).toEqual([
      { id: "support.guestMessage", enabled: false, delivery: "daily" },
    ]);
    expect(parseMailEventStates("support", null)).toEqual([
      { id: "support.ticketOpened", enabled: false, delivery: "instant" },
    ]);
  });

  it("görünen ad başlığa satır sonu / tırnak / <> / ters bölü sokamaz (@tarodan/types kuralı)", () => {
    expect(isValidMailDisplayName("Tarodan Sipariş")).toBe(true);
    expect(isValidMailDisplayName("  Tarodan & Co. (Destek)  ")).toBe(true);
    expect(isValidMailDisplayName('Ta"rodan')).toBe(false);
    expect(isValidMailDisplayName("Tarodan\r\nBcc: x@y.z")).toBe(false);
    expect(isValidMailDisplayName("Tarodan <x@y.z>")).toBe(false);
    expect(isValidMailDisplayName("Taro\\dan")).toBe(false);
    expect(isValidMailDisplayName("   ")).toBe(false);
    expect(
      isValidMailDisplayName("a".repeat(MAIL_DISPLAY_NAME_MAX_LENGTH)),
    ).toBe(true);
    expect(
      isValidMailDisplayName("a".repeat(MAIL_DISPLAY_NAME_MAX_LENGTH + 1)),
    ).toBe(false);
  });

  it("adres doğrulaması satır sonunu reddeder", () => {
    expect(isValidMailAddress("a@tarodan.com.tr")).toBe(true);
    expect(isValidMailAddress("a@tarodan.com.tr\r\nBcc: b@c.d")).toBe(false);
  });

  it("From metni tırnaklı ad + açılı adres", () => {
    expect(formatMailFrom("Tarodan Sipariş", "siparis@tarodan.com.tr")).toBe(
      '"Tarodan Sipariş" <siparis@tarodan.com.tr>',
    );
  });
});

describe("MailRoutingDirectory", () => {
  const build = () => {
    const prisma = {
      mailSenderAccount: {
        findMany: jest.fn().mockResolvedValue([account]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mailAreaSetting: {
        findMany: jest.fn().mockResolvedValue([
          {
            areaId: "order",
            senderAccountId: "acc-1",
            displayName: null,
            replyTo: "destek@tarodan.com.tr",
            internalRecipients: ["siparis@tarodan.com.tr"],
            events: { "order.paid": { enabled: true, delivery: "hourly" } },
          },
          {
            areaId: "retired-area",
            senderAccountId: null,
            displayName: null,
            replyTo: null,
            internalRecipients: [],
            events: {},
          },
        ]),
      },
    };
    const cipher = { decrypt: jest.fn(() => "plain") };
    return {
      directory: new MailRoutingDirectory(prisma as never, cipher as never),
      prisma,
      cipher,
    };
  };

  it("alan satırını hesabıyla birleştirir; satırı olmayan alan varsayılandır", async () => {
    const { directory } = build();

    const order = await directory.area("order");
    expect(order.account?.address).toBe("siparis@tarodan.com.tr");
    expect(order.replyTo).toBe("destek@tarodan.com.tr");
    expect(order.events).toEqual([
      { id: "order.paid", enabled: true, delivery: "hourly" },
    ]);

    const refund = await directory.area("refund");
    expect(refund.account).toBeNull();
    expect(refund.internalRecipients).toEqual([]);
    expect(refund.events.every((e) => !e.enabled)).toBe(true);
  });

  it("sözlükte olmayan alan satırını yok sayar", async () => {
    const { directory } = build();
    const snapshot = await directory.snapshot();
    expect([...snapshot.areas.keys()]).toEqual(["order"]);
  });

  it("TTL içinde önbellekten okur, invalidate sonrası tazeler", async () => {
    const { directory, prisma } = build();
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);

    await directory.snapshot();
    await directory.snapshot();
    expect(prisma.mailAreaSetting.findMany).toHaveBeenCalledTimes(1);

    directory.invalidate();
    await directory.snapshot();
    expect(prisma.mailAreaSetting.findMany).toHaveBeenCalledTimes(2);

    now.mockReturnValue(1_000 + MAIL_ROUTING_CACHE_TTL_MS + 1);
    await directory.snapshot();
    expect(prisma.mailAreaSetting.findMany).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });

  it("okuma hatası önbelleğe alınmaz", async () => {
    const { directory, prisma } = build();
    prisma.mailAreaSetting.findMany.mockRejectedValueOnce(new Error("down"));

    await expect(directory.snapshot()).rejects.toThrow("down");
    await expect(directory.snapshot()).resolves.toBeDefined();
  });

  it("kutu sonucu yazımı best-effort: hata fırlatmaz", async () => {
    const { directory, prisma } = build();
    prisma.mailSenderAccount.updateMany.mockRejectedValueOnce(new Error("x"));

    await expect(
      directory.recordAccountResult("acc-1", false, "Invalid login"),
    ).resolves.toBeUndefined();
  });

  it("başarılı sonuç hatayı temizler", async () => {
    const { directory, prisma } = build();

    await directory.recordAccountResult("acc-1", true, null);

    expect(prisma.mailSenderAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: expect.objectContaining({ lastTestOk: true, lastTestError: null }),
    });
  });

  it("canlı başarı işareti yalnız hatalı işaretli satırda kaldırır (koşullu yazım)", async () => {
    const { directory, prisma } = build();

    await directory.clearAccountFailure("acc-1");

    expect(prisma.mailSenderAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "acc-1", lastTestOk: false },
      data: expect.objectContaining({ lastTestOk: true, lastTestError: null }),
    });
  });

  it("işaret temizleme best-effort: hata fırlatmaz", async () => {
    const { directory, prisma } = build();
    prisma.mailSenderAccount.updateMany.mockRejectedValueOnce(new Error("x"));

    await expect(
      directory.clearAccountFailure("acc-1"),
    ).resolves.toBeUndefined();
  });

  it("parmak izi son-test alanlarından etkilenmez, şifreden etkilenir", () => {
    const base = senderAccountFingerprint(account);
    expect(senderAccountFingerprint({ ...account })).toBe(base);
    expect(senderAccountFingerprint({ ...account, lastTestOk: false })).toBe(
      base,
    );
    expect(
      senderAccountFingerprint({ ...account, passwordEncrypted: "v1:y" }),
    ).not.toBe(base);
  });
});
