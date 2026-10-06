import type { MailAreaId } from "@tarodan/types";
import {
  MAIL_DIGEST_BATCH_LIMIT,
  MAIL_DIGEST_MAX_MAILS_PER_AREA,
  MAIL_INSTANT_GRACE_MS,
  MailInternalDeliveryService,
} from "./mail-internal-delivery.service";
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
      // Tek satır hedefli (`where.id` metin) yazımlar depoya uygulanır;
      // özet işinin toplu yazımları yalnız kaydedilir.
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id?: unknown; sentAt?: unknown };
          data: Partial<NoticeRow>;
        }) => {
          if (typeof where.id !== "string") return { count: 0 };
          const row = store.find(
            (r) => r.id === where.id && (where.sentAt !== null || !r.sentAt),
          );
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
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

type UpdateManyArgs = {
  data: Record<string, unknown>;
  where: { claimId?: unknown };
};

/** `updateMany` çağrılarının tipli görünümü (jest mock.calls `any[][]` döner). */
const updateManyCalls = (t: {
  prisma: { mailInternalNotice: { updateMany: jest.Mock } };
}): Array<[UpdateManyArgs]> =>
  t.prisma.mailInternalNotice.updateMany.mock.calls as Array<[UpdateManyArgs]>;

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
      .mockResolvedValueOnce(claimed)
      // 4) aynı alan için yeni turda aday kalmadı → döngü biter
      .mockResolvedValue([]) as never;
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
    const markSent = updateManyCalls(t).find(([args]) => "sentAt" in args.data);
    expect(markSent).toBeDefined();
  });

  it("gönderim başarısızsa sahiplenmeyi bırakır ve koşu hata verir", async () => {
    const t = digestHarness(orderArea("hourly"));
    t.smtp.sendEmail.mockResolvedValue({ success: false, error: "down" });

    await expect(t.service.runDigest("hourly")).rejects.toThrow();
    const release = updateManyCalls(t).find(
      ([args]) =>
        args.data.claimId === null &&
        "claimedAt" in args.data &&
        typeof args.where.claimId === "string",
    );
    expect(release).toBeDefined();
  });

  it("alıcı listesi boşaltıldıysa birikmiş olayları bırakır (göndermez)", async () => {
    const t = digestHarness(routing("order"));

    const summary = await t.service.runDigest("hourly");

    expect(t.smtp.sendEmail).not.toHaveBeenCalled();
    expect(summary.stats).toMatchObject({ dropped: 2 });
  });

  it("günlük koşu eski kayıtları temizler — gönderilememiş eskiler dahil", async () => {
    const t = build(orderArea("daily"));
    t.prisma.mailInternalNotice.findMany = jest
      .fn()
      .mockResolvedValue([]) as never;

    await t.service.runDigest("daily");

    expect(t.prisma.mailInternalNotice.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { sentAt: { lt: expect.any(Date) } },
          { sentAt: null, createdAt: { lt: expect.any(Date) } },
        ],
      },
    });
  });

  it("saatlik koşu yalnız saklama yapmaz", async () => {
    const t = build(orderArea("hourly"));
    t.prisma.mailInternalNotice.findMany = jest
      .fn()
      .mockResolvedValue([]) as never;

    await t.service.runDigest("hourly");

    expect(t.prisma.mailInternalNotice.deleteMany).not.toHaveBeenCalled();
  });

  /** Alan kuyruğu: her tur `batch` aday + o kadar sahiplenilmiş satır döner. */
  function backlogHarness(batches: number, perBatch = 2) {
    const t = build(orderArea("daily"));
    const findMany = jest.fn().mockResolvedValueOnce([{ areaId: "order" }]);
    for (let b = 0; b < batches; b++) {
      const ids = Array.from({ length: perBatch }, (_, i) => `b${b}-${i}`);
      findMany
        .mockResolvedValueOnce(ids.map((id) => ({ id })))
        .mockResolvedValueOnce(ids.map((id) => pendingRow(id, "order")));
    }
    findMany.mockResolvedValue([]);
    t.prisma.mailInternalNotice.findMany = findMany as never;
    return t;
  }

  it("birikmiş kuyruğu aynı koşuda boşaltır: tur başına bir özet e-postası", async () => {
    const t = backlogHarness(3);

    const summary = await t.service.runDigest("daily");

    expect(t.smtp.sendEmail).toHaveBeenCalledTimes(3);
    expect(summary.stats).toMatchObject({ mails: 3, events: 6, capped: 0 });
  });

  it("alan başına koşu sınırında durur ve bunu bildirir", async () => {
    const t = backlogHarness(MAIL_DIGEST_MAX_MAILS_PER_AREA + 2);

    const summary = await t.service.runDigest("daily");

    expect(t.smtp.sendEmail).toHaveBeenCalledTimes(
      MAIL_DIGEST_MAX_MAILS_PER_AREA,
    );
    expect(summary.stats).toMatchObject({ capped: 1 });
  });

  it("aday sorgusu en eski önce ve parti sınırıyla", async () => {
    const t = backlogHarness(1);

    await t.service.runDigest("daily");

    const candidateQuery = (
      t.prisma.mailInternalNotice.findMany as unknown as jest.Mock
    ).mock.calls[1][0];
    expect(candidateQuery).toMatchObject({
      orderBy: { createdAt: "asc" },
      take: MAIL_DIGEST_BATCH_LIMIT,
    });
  });

  it("saatlik koşu ölü anlık kayıtları (süresi geçmiş, gönderilmemiş) da toplar", async () => {
    const t = build(orderArea("hourly"));
    const findMany = jest.fn().mockResolvedValue([]);
    t.prisma.mailInternalNotice.findMany = findMany as never;
    const now = Date.now();

    await t.service.runDigest("hourly");

    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ sentAt: null, claimId: null });
    expect(where.OR).toEqual([
      { delivery: "hourly" },
      { delivery: "instant", createdAt: { lt: expect.any(Date) } },
    ]);
    const graceCutoff = where.OR[1].createdAt.lt.getTime();
    expect(now - graceCutoff).toBeGreaterThanOrEqual(
      MAIL_INSTANT_GRACE_MS - 1000,
    );
  });

  it("günlük koşu anlık kayıtlara dokunmaz", async () => {
    const t = build(orderArea("daily"));
    const findMany = jest.fn().mockResolvedValue([]);
    t.prisma.mailInternalNotice.findMany = findMany as never;

    await t.service.runDigest("daily");

    expect(findMany.mock.calls[0][0].where).toEqual({
      delivery: "daily",
      sentAt: null,
      claimId: null,
    });
  });
});

describe("anlık kayıt — özet işiyle yarış", () => {
  it("özet işi ölü sayıp sahiplendiyse outbox yeniden denemesi göndermez", async () => {
    const t = build(orderArea("instant"));
    t.prisma.mailInternalNotice.upsert.mockResolvedValueOnce({
      id: "n-1",
      sourceKey: "evt-1",
      areaId: "order",
      eventId: "order.paid",
      delivery: "instant",
      payload: payload.notice,
      occurredAt: new Date(),
      claimId: "digest-claim",
      claimedAt: new Date(),
      sentAt: null,
      createdAt: new Date(),
    });

    await t.service.handleEvent(payload, { id: "evt-1" });

    expect(t.smtp.sendEmail).not.toHaveBeenCalled();
  });
});
