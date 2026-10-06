import type { MailAreaId } from "@tarodan/types";
import { MailInternalDeliveryService } from "./mail-internal-delivery.service";
import {
  defaultAreaRouting,
  type MailAreaRouting,
} from "../../mail/mail-routing-directory";
import { OUTBOX_MAIL_INTERNAL_EVENT } from "../../outbox/outbox.types";
import type { MailInternalOutboxPayload } from "../helpers/mail-internal-notice.types";

const routing = (
  area: MailAreaId,
  patch: Partial<MailAreaRouting> = {},
): MailAreaRouting => ({ ...defaultAreaRouting(area), ...patch });

const recipients = ["siparis@tarodan.com.tr", "serhat@tarodan.com.tr"];

const orderArea = (delivery: "instant" | "hourly" | "daily") =>
  routing("order", {
    internalRecipients: recipients,
    events: [{ id: "order.paid", enabled: true, delivery }],
  });

const payload: MailInternalOutboxPayload = {
  eventId: "order.paid",
  notice: {
    ref: "GRP-10001",
    facts: [{ label: "total", value: "1.250,00 TL" }],
    adminPath: "/operations/orders",
  },
  occurredAt: "2026-10-06T09:15:00.000Z",
};

type NoticeRow = {
  id: string;
  sourceKey: string;
  areaId: string;
  eventId: string;
  delivery: string;
  payload: unknown;
  occurredAt: Date;
  claimId: string | null;
  claimedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

function build(areaRouting: MailAreaRouting, rows: NoticeRow[] = []) {
  const store = [...rows];
  const prisma = {
    mailInternalNotice: {
      upsert: jest.fn(
        async ({
          where,
          create,
        }: {
          where: { sourceKey: string };
          create: Omit<
            NoticeRow,
            "id" | "claimId" | "claimedAt" | "sentAt" | "createdAt"
          >;
        }) => {
          const existing = store.find((r) => r.sourceKey === where.sourceKey);
          if (existing) return existing;
          const row: NoticeRow = {
            ...create,
            id: `n-${store.length + 1}`,
            claimId: null,
            claimedAt: null,
            sentAt: null,
            createdAt: new Date(),
          };
          store.push(row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<NoticeRow>;
        }) => {
          const row = store.find((r) => r.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
      ),
      updateMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const registry = { register: jest.fn() };
  const directory = { area: jest.fn().mockResolvedValue(areaRouting) };
  const smtp = {
    sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: "m" }),
  };
  const service = new MailInternalDeliveryService(
    prisma as never,
    registry as never,
    directory as never,
    smtp as never,
  );
  return { service, prisma, registry, smtp, store };
}

describe("MailInternalDeliveryService — outbox handler", () => {
  it("handler'ını outbox kaydına bağlar", () => {
    const { service, registry } = build(orderArea("instant"));
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(
      OUTBOX_MAIL_INTERNAL_EVENT,
      expect.any(Function),
    );
  });

  it("anlık: alanın kutusundan, alanın alıcılarına TEK e-posta; kayıt gönderildi işaretlenir", async () => {
    const { service, smtp, store } = build(orderArea("instant"));

    await service.handleEvent(payload, { id: "evt-1" });

    expect(smtp.sendEmail).toHaveBeenCalledTimes(1);
    const mail = smtp.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("siparis@tarodan.com.tr, serhat@tarodan.com.tr");
    expect(mail.area).toBe("order");
    expect(mail.subject).toContain("GRP-10001");
    expect(mail.html).toContain("/operations/orders");
    expect(store[0].sentAt).toBeInstanceOf(Date);
  });

  it("yeniden çalıştırılırsa (at-least-once) ikinci kez göndermez", async () => {
    const { service, smtp } = build(orderArea("instant"));

    await service.handleEvent(payload, { id: "evt-1" });
    await service.handleEvent(payload, { id: "evt-1" });

    expect(smtp.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("gönderim başarısızsa fırlatır (outbox yeniden dener), kayıt gönderilmemiş kalır", async () => {
    const { service, smtp, store } = build(orderArea("instant"));
    smtp.sendEmail.mockResolvedValue({ success: false, error: "down" });

    await expect(service.handleEvent(payload, { id: "evt-1" })).rejects.toThrow(
      "down",
    );
    expect(store[0].sentAt).toBeNull();
  });

  it("saatlik/günlük: kaydı saklar, göndermez (özet işi gönderir)", async () => {
    const { service, smtp, store } = build(orderArea("hourly"));

    await service.handleEvent(payload, { id: "evt-1" });

    expect(smtp.sendEmail).not.toHaveBeenCalled();
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({ delivery: "hourly", areaId: "order" });
  });

  it("olay bu arada kapatıldıysa sessizce bırakır", async () => {
    const { service, smtp, store } = build(routing("order"));

    await service.handleEvent(payload, { id: "evt-1" });

    expect(smtp.sendEmail).not.toHaveBeenCalled();
    expect(store).toHaveLength(0);
  });

  it("misafir mesajında Reply-To misafirdir", async () => {
    const { service, smtp } = build(routing("guestMessage"));

    await service.handleEvent(
      {
        eventId: "support.guestMessage",
        notice: {
          ref: "ILT-1",
          facts: [],
          adminPath: "/messaging/support?tab=guest",
          replyTo: "guest@example.com",
        },
        occurredAt: payload.occurredAt,
      },
      { id: "evt-2" },
    );

    expect(smtp.sendEmail.mock.calls[0][0]).toMatchObject({
      to: "destek@tarodan.com.tr",
      replyTo: "guest@example.com",
      area: "guestMessage",
    });
  });

  it("bilinmeyen olay kimliği bırakılır", async () => {
    const { service, smtp } = build(orderArea("instant"));

    await service.handleEvent(
      { ...payload, eventId: "nope" as never },
      { id: "evt-3" },
    );

    expect(smtp.sendEmail).not.toHaveBeenCalled();
  });
});

describe("MailInternalDeliveryService.runDigest — özet işi", () => {
  const pendingRow = (id: string, area: string): NoticeRow => ({
    id,
    sourceKey: id,
    areaId: area,
    eventId: "order.paid",
    delivery: "hourly",
    payload: payload.notice,
    occurredAt: new Date("2026-10-06T09:00:00Z"),
    claimId: "claim",
    claimedAt: new Date(),
    sentAt: null,
    createdAt: new Date(),
  });

  function digestHarness(areaRouting: MailAreaRouting) {
    const t = build(areaRouting);
    const claimed = [pendingRow("n1", "order"), pendingRow("n2", "order")];
    t.prisma.mailInternalNotice.findMany = jest
      .fn()
      // 1) bekleyen alanlar
      .mockResolvedValueOnce([{ areaId: "order" }])
      // 2) alanın adayları
      .mockResolvedValueOnce([{ id: "n1" }, { id: "n2" }])
      // 3) sahiplenilen satırlar
      .mockResolvedValueOnce(claimed) as never;
    return t;
  }

  it("alan başına TEK özet e-postası gönderir ve satırları gönderildi işaretler", async () => {
    const t = digestHarness(orderArea("hourly"));

    const summary = await t.service.runDigest("hourly");

    expect(t.smtp.sendEmail).toHaveBeenCalledTimes(1);
    const mail = t.smtp.sendEmail.mock.calls[0][0];
    expect(mail.area).toBe("order");
    expect(mail.to).toBe("siparis@tarodan.com.tr, serhat@tarodan.com.tr");
    expect(mail.template).toBe("internal-digest:hourly");
    expect(summary.stats).toMatchObject({ mails: 1, events: 2 });
    const markSent = t.prisma.mailInternalNotice.updateMany.mock.calls.find(
      ([args]: [{ data: Record<string, unknown> }]) => "sentAt" in args.data,
    );
    expect(markSent).toBeDefined();
  });

  it("gönderim başarısızsa sahiplenmeyi bırakır ve koşu hata verir", async () => {
    const t = digestHarness(orderArea("hourly"));
    t.smtp.sendEmail.mockResolvedValue({ success: false, error: "down" });

    await expect(t.service.runDigest("hourly")).rejects.toThrow();
    const release = t.prisma.mailInternalNotice.updateMany.mock.calls.find(
      ([args]: [{ data: Record<string, unknown> }]) =>
        args.data.claimId === null &&
        "claimedAt" in args.data &&
        (args as { where: { claimId?: unknown } }).where.claimId !== undefined,
    );
    expect(release).toBeDefined();
  });

  it("alıcı listesi boşaltıldıysa birikmiş olayları bırakır (göndermez)", async () => {
    const t = digestHarness(routing("order"));

    const summary = await t.service.runDigest("hourly");

    expect(t.smtp.sendEmail).not.toHaveBeenCalled();
    expect(summary.stats).toMatchObject({ dropped: 2 });
  });

  it("günlük koşu eski gönderilmiş kayıtları temizler", async () => {
    const t = build(orderArea("daily"));
    t.prisma.mailInternalNotice.findMany = jest
      .fn()
      .mockResolvedValue([]) as never;

    await t.service.runDigest("daily");

    expect(t.prisma.mailInternalNotice.deleteMany).toHaveBeenCalledWith({
      where: { sentAt: { lt: expect.any(Date) } },
    });
  });
});
