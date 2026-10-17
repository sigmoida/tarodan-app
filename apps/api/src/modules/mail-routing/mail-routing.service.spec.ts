import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MAIL_AREAS } from "@tarodan/types";
import {
  MailRoutingService,
  mergeEvents,
  normalizeRecipients,
} from "./mail-routing.service";

const accountRow = {
  id: "acc-1",
  address: "siparis@tarodan.com.tr",
  displayName: "Tarodan Sipariş",
  host: null,
  port: null,
  secure: null,
  username: "siparis@tarodan.com.tr",
  passwordEncrypted: "v1:secret-cipher-text",
  lastTestAt: null,
  lastTestOk: null,
  lastTestError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  updatedBy: null,
};

function build(settings: Array<Record<string, unknown>> = []) {
  const tx = {
    mailAreaSetting: {
      findUnique: jest.fn(
        async ({ where }: { where: { areaId: string } }) =>
          settings.find((s) => s.areaId === where.areaId) ?? null,
      ),
      upsert: jest.fn(
        async ({ create }: { create: Record<string, unknown> }) => ({
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        }),
      ),
    },
    mailSenderAccount: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "acc-1" ? { id: "acc-1" } : null,
      ),
    },
  };
  const prisma = {
    mailSenderAccount: { findMany: jest.fn().mockResolvedValue([accountRow]) },
    mailAreaSetting: { findMany: jest.fn().mockResolvedValue(settings) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const directory = { invalidate: jest.fn() };
  const smtp = { defaultFrom: "Tarodan <info@tarodan.com.tr>" };
  const service = new MailRoutingService(
    prisma as never,
    directory as never,
    smtp as never,
  );
  return { service, prisma, tx, directory };
}

describe("MailRoutingService.getState", () => {
  it("her alan sözleşme sırasıyla, şablonlarıyla ve varsayılanlarla döner", async () => {
    const { service } = build([
      {
        areaId: "order",
        senderAccountId: "acc-1",
        displayName: null,
        replyTo: null,
        internalRecipients: ["siparis@tarodan.com.tr"],
        events: { "order.paid": { enabled: true, delivery: "daily" } },
      },
    ]);

    const state = await service.getState();

    expect(state.defaultFrom).toBe("Tarodan <info@tarodan.com.tr>");
    expect(state.areas.map((a) => a.id)).toEqual([...MAIL_AREAS]);
    const order = state.areas.find((a) => a.id === "order")!;
    expect(order.templateKeys).toContain("order-paid");
    expect(order.events).toEqual([
      { id: "order.paid", enabled: true, delivery: "daily" },
    ]);
    const refund = state.areas.find((a) => a.id === "refund")!;
    expect(refund).toMatchObject({
      senderAccountId: null,
      internalRecipients: [],
    });
    expect(
      refund.events.every((e) => !e.enabled && e.delivery === "instant"),
    ).toBe(true);
  });

  it("hesap görünümü şifreyi (şifreli hali dahil) taşımaz; kullanan alanları listeler", async () => {
    const { service } = build([
      {
        areaId: "order",
        senderAccountId: "acc-1",
        internalRecipients: [],
        events: {},
      },
      {
        areaId: "cancellation",
        senderAccountId: "acc-1",
        internalRecipients: [],
        events: {},
      },
    ]);

    const state = await service.getState();

    expect(state.accounts[0]).toMatchObject({
      hasPassword: true,
      usedByAreas: ["order", "cancellation"],
    });
    expect(JSON.stringify(state)).not.toContain("secret-cipher-text");
    expect(state.accounts[0]).not.toHaveProperty("passwordEncrypted");
    expect(state.accounts[0]).not.toHaveProperty("password");
  });
});

describe("MailRoutingService.updateArea", () => {
  it("alıcıları küçük harfe çevirip tekilleştirir, yazar ve önbelleği boşaltır", async () => {
    const { service, tx, directory } = build();

    const result = await service.updateArea(
      "order",
      {
        internalRecipients: [
          "Siparis@Tarodan.com.tr",
          "siparis@tarodan.com.tr",
          "serhat@tarodan.com.tr",
        ],
      },
      "admin-1",
    );

    expect(result.internalRecipients).toEqual([
      "siparis@tarodan.com.tr",
      "serhat@tarodan.com.tr",
    ]);
    expect(tx.mailAreaSetting.upsert.mock.calls[0][0].create.updatedBy).toBe(
      "admin-1",
    );
    expect(directory.invalidate).toHaveBeenCalled();
  });

  it("bilinmeyen alan → 404", async () => {
    const { service } = build();
    await expect(
      service.updateArea("nope", {}, "admin-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("olmayan hesap atanamaz → 400", async () => {
    const { service } = build();
    await expect(
      service.updateArea("order", { senderAccountId: "missing" }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("geçersiz Reply-To ve görünen ad reddedilir; boş değer null olur", async () => {
    const { service } = build();
    await expect(
      service.updateArea("order", { replyTo: "not-an-email" }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateArea("order", { displayName: 'Ta"rodan' }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);

    const cleared = await service.updateArea(
      "order",
      { replyTo: "  ", displayName: "" },
      "admin-1",
    );
    expect(cleared).toMatchObject({ replyTo: null, displayName: null });
  });

  it("denetim adımı AYNI işlem istemcisiyle önce/sonra durumla çağrılır", async () => {
    const { service, tx } = build();
    const afterWrite = jest.fn().mockResolvedValue(undefined);

    await service.updateArea(
      "order",
      { senderAccountId: "acc-1" },
      "admin-1",
      afterWrite,
    );

    expect(afterWrite).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        before: expect.objectContaining({ senderAccountId: null }),
        after: expect.objectContaining({ senderAccountId: "acc-1" }),
      }),
    );
  });

  it("denetim yazılamazsa hata yükselir (işlem geri alınır)", async () => {
    const { service } = build();
    await expect(
      service.updateArea("order", { replyTo: null }, "admin-1", async () => {
        throw new Error("audit down");
      }),
    ).rejects.toThrow("audit down");
  });
});

describe("normalizeRecipients / mergeEvents", () => {
  it("20'den fazla tekil alıcı reddedilir", () => {
    const many = Array.from({ length: 21 }, (_, i) => `u${i}@tarodan.com.tr`);
    expect(() => normalizeRecipients(many)).toThrow(BadRequestException);
    expect(normalizeRecipients([...many.slice(0, 20), many[0]])).toHaveLength(
      20,
    );
  });

  it("geçersiz alıcı reddedilir", () => {
    expect(() => normalizeRecipients(["ok@tarodan.com.tr", "bad"])).toThrow(
      BadRequestException,
    );
  });

  it("başka alanın olayı, çift olay ve geçersiz teslim reddedilir", () => {
    const current = [
      {
        id: "trade.started" as const,
        enabled: false,
        delivery: "instant" as const,
      },
      {
        id: "trade.disputed" as const,
        enabled: false,
        delivery: "instant" as const,
      },
    ];
    expect(() =>
      mergeEvents("trade", current, [
        { id: "order.paid", enabled: true, delivery: "instant" },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      mergeEvents("trade", current, [
        { id: "trade.started", enabled: true, delivery: "instant" },
        { id: "trade.started", enabled: false, delivery: "instant" },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      mergeEvents("trade", current, [
        { id: "trade.started", enabled: true, delivery: "weekly" },
      ]),
    ).toThrow(BadRequestException);

    expect(
      mergeEvents("trade", current, [
        { id: "trade.disputed", enabled: true, delivery: "hourly" },
      ]),
    ).toEqual([
      { id: "trade.started", enabled: false, delivery: "instant" },
      { id: "trade.disputed", enabled: true, delivery: "hourly" },
    ]);
  });
});
