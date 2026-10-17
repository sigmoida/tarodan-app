import type { MailAreaId } from "@tarodan/types";
import { MailInternalNotifier } from "./mail-internal-notifier.service";
import { internalNoticeRoute } from "./mail-internal-recipients";
import {
  defaultAreaRouting,
  type MailAreaRouting,
} from "../../mail/mail-routing-directory";
import { OUTBOX_MAIL_INTERNAL_EVENT } from "../../outbox/outbox.types";
import { parseMailEventStates } from "../../mail/helpers/mail-area-settings";
import { guestMessageNotice } from "../helpers/mail-internal-notices";

const routing = (
  area: MailAreaId,
  patch: Partial<MailAreaRouting> = {},
): MailAreaRouting => ({ ...defaultAreaRouting(area), ...patch });

const enabledOrderArea = routing("order", {
  internalRecipients: ["siparis@tarodan.com.tr", "serhat@tarodan.com.tr"],
  events: [{ id: "order.paid", enabled: true, delivery: "instant" }],
});

const notice = { ref: "GRP-10001", facts: [], adminPath: "/operations/orders" };

function build(area: MailAreaRouting | Error) {
  const prisma = { tag: "prisma" };
  const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const directory = {
    area: jest.fn(() =>
      area instanceof Error ? Promise.reject(area) : Promise.resolve(area),
    ),
  };
  const notifier = new MailInternalNotifier(
    prisma as never,
    outbox as never,
    directory as never,
  );
  return { notifier, outbox, prisma };
}

describe("internalNoticeRoute — gönderim kararı (notifier + handler ortak)", () => {
  it("kapalı olay → bırak", () => {
    expect(
      internalNoticeRoute(
        "order.paid",
        routing("order", { internalRecipients: ["a@tarodan.com.tr"] }),
      ),
    ).toBeNull();
  });

  it("açık olay ama alıcı yok → bırak", () => {
    expect(
      internalNoticeRoute(
        "order.paid",
        routing("order", {
          events: [{ id: "order.paid", enabled: true, delivery: "daily" }],
        }),
      ),
    ).toBeNull();
  });

  it("açık olay + alıcılar → alanın alıcıları ve teslim modu", () => {
    expect(internalNoticeRoute("order.paid", enabledOrderArea)).toEqual({
      recipients: ["siparis@tarodan.com.tr", "serhat@tarodan.com.tr"],
      delivery: "instant",
    });
  });

  describe("misafir mesajı geri düşüşü (eski davranış korunur)", () => {
    const original = process.env.SUPPORT_NOTIFICATION_EMAIL;
    afterEach(() => {
      // `process.env.X = undefined` değeri "undefined" METNİ yapar; tanımsızsa sil.
      if (original === undefined) delete process.env.SUPPORT_NOTIFICATION_EMAIL;
      else process.env.SUPPORT_NOTIFICATION_EMAIL = original;
    });

    it("hiç ayar yokken (olay varsayılanı açık) SUPPORT_NOTIFICATION_EMAIL'e anında gider", () => {
      process.env.SUPPORT_NOTIFICATION_EMAIL = "Destek@Tarodan.com.tr";
      expect(
        internalNoticeRoute("support.guestMessage", routing("guestMessage")),
      ).toEqual({ recipients: ["destek@tarodan.com.tr"], delivery: "instant" });
    });

    it("env yoksa eski varsayılan destek@tarodan.com.tr", () => {
      delete process.env.SUPPORT_NOTIFICATION_EMAIL;
      expect(
        internalNoticeRoute("support.guestMessage", routing("guestMessage"))
          ?.recipients,
      ).toEqual(["destek@tarodan.com.tr"]);
    });

    it("alıcı eklenip olay ayarı hiç kaydedilmemişse e-posta KESİLMEZ, alıcılara yönelir", () => {
      // Satır `events: {}` ile yazılmış alan: parse varsayılanı uygular.
      const added = routing("guestMessage", {
        internalRecipients: ["x@tarodan.com.tr"],
        events: parseMailEventStates("guestMessage", {}),
      });
      expect(internalNoticeRoute("support.guestMessage", added)).toEqual({
        recipients: ["x@tarodan.com.tr"],
        delivery: "instant",
      });
    });

    it("olay listesinde kayıt yoksa da varsayılan (açık) geçerlidir", () => {
      expect(
        internalNoticeRoute(
          "support.guestMessage",
          routing("guestMessage", {
            internalRecipients: ["x@tarodan.com.tr"],
            events: [],
          }),
        ),
      ).toEqual({ recipients: ["x@tarodan.com.tr"], delivery: "instant" });
    });

    it("admin açıkça kapattıysa gitmez (alıcı olsun olmasın)", () => {
      const off = [
        {
          id: "support.guestMessage" as const,
          enabled: false,
          delivery: "instant" as const,
        },
      ];
      expect(
        internalNoticeRoute(
          "support.guestMessage",
          routing("guestMessage", { events: off }),
        ),
      ).toBeNull();
      expect(
        internalNoticeRoute(
          "support.guestMessage",
          routing("guestMessage", {
            internalRecipients: ["x@tarodan.com.tr"],
            events: off,
          }),
        ),
      ).toBeNull();
    });
  });
});

describe("MailInternalNotifier.emit", () => {
  it("açık olayı outbox'a TEK satır olarak yazar (tekilleştirme: iş numarası)", async () => {
    const { notifier, outbox, prisma } = build(enabledOrderArea);

    await notifier.emit("order.paid", notice);

    expect(outbox.enqueue).toHaveBeenCalledWith(prisma, {
      type: OUTBOX_MAIL_INTERNAL_EVENT,
      payload: expect.objectContaining({ eventId: "order.paid", notice }),
      dedupeKey: `${OUTBOX_MAIL_INTERNAL_EVENT}:order.paid:GRP-10001`,
      maxAttempts: 5,
    });
  });

  it("verilen tekilleştirme anahtarını kullanır", async () => {
    const { notifier, outbox } = build(enabledOrderArea);

    await notifier.emit("order.paid", notice, { dedupeKey: "group-1" });

    expect(outbox.enqueue.mock.calls[0][1].dedupeKey).toBe(
      `${OUTBOX_MAIL_INTERNAL_EVENT}:order.paid:group-1`,
    );
  });

  it("kapalı olay ya da alıcısız alan → hiçbir satır yazılmaz", async () => {
    const disabled = build(routing("order"));
    await disabled.notifier.emit("order.paid", notice);
    expect(disabled.outbox.enqueue).not.toHaveBeenCalled();

    const noRecipients = build(
      routing("order", {
        events: [{ id: "order.paid", enabled: true, delivery: "instant" }],
      }),
    );
    await noRecipients.notifier.emit("order.paid", notice);
    expect(noRecipients.outbox.enqueue).not.toHaveBeenCalled();
  });

  it("test şeridi işlemleri personele bildirilmez", async () => {
    const { notifier, outbox } = build(enabledOrderArea);

    await notifier.emit("order.paid", notice, { isTest: true });

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("ayar okunamazsa satır yine yazılır (kararı handler verir)", async () => {
    const { notifier, outbox } = build(new Error("db down"));

    await notifier.emit("order.paid", notice);

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it("outbox hatası iş akışına YÜKSELMEZ", async () => {
    const { notifier, outbox } = build(enabledOrderArea);
    outbox.enqueue.mockRejectedValue(new Error("db down"));

    await expect(notifier.emit("order.paid", notice)).resolves.toBeUndefined();
  });

  it("misafir mesajı alıcısız alanda da kuyruğa girer (eski adres geri düşüşü)", async () => {
    const { notifier, outbox } = build(routing("guestMessage"));

    await notifier.emit(
      "support.guestMessage",
      guestMessageNotice({
        referenceNumber: "ILT-1",
        name: "Ayşe",
        email: "ayse@example.com",
        subject: "Soru",
        message: "Merhaba",
      }),
    );

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });
});
