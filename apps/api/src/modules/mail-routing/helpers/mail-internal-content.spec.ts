import { getMessages } from "@tarodan/i18n";
import { MAIL_AREAS, MAIL_INTERNAL_EVENTS } from "@tarodan/types";
import {
  mailEventCatalogKey,
  renderInternalDigest,
  renderInternalNotice,
} from "./mail-internal-content";
import { MAIL_NOTICE_FACT_LABELS } from "./mail-internal-notice.types";
import {
  MAIL_NOTICE_EXCERPT_LENGTH,
  guestMessageNotice,
  orderCancelledNotice,
  orderPaidNotice,
} from "./mail-internal-notices";

const ctx = {
  adminBaseUrl: "https://admin.tarodan.com.tr",
  frontendUrl: "https://tarodan.com.tr",
  to: "siparis@tarodan.com.tr",
};

function lookup(tree: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
}

describe("personel e-postası katalog anahtarları (tr + en)", () => {
  const keys = [
    ...Object.keys(MAIL_INTERNAL_EVENTS).flatMap((id) => [
      `server.mailRouting.internal.events.${mailEventCatalogKey(id as never)}.subject`,
      `server.mailRouting.internal.events.${mailEventCatalogKey(id as never)}.title`,
    ]),
    ...MAIL_AREAS.map((area) => `server.mailRouting.internal.areas.${area}`),
    ...MAIL_NOTICE_FACT_LABELS.map(
      (label) => `server.mailRouting.internal.facts.${label}`,
    ),
    "server.mailRouting.internal.digest.subject",
    "server.mailRouting.internal.digest.hourly",
    "server.mailRouting.internal.digest.daily",
  ];

  it.each(["tr", "en"] as const)("%s kataloğunda her anahtar var", (locale) => {
    const messages = getMessages(locale);
    const missing = keys.filter(
      (key) => typeof lookup(messages, key) !== "string",
    );
    expect(missing).toEqual([]);
  });
});

describe("renderInternalNotice", () => {
  it("konu iş numarasını taşır; gövde olguları ve panel linkini içerir", () => {
    const mail = renderInternalNotice(
      "order.paid",
      orderPaidNotice({
        ref: "GRP-10001",
        buyerName: "ali_k",
        total: 1250,
        orders: [
          {
            id: "o1",
            orderNumber: "ORD-10001",
            productTitle: "1:18 Ferrari",
            amount: 1250,
            sellerName: "ModelDukkan",
          },
        ],
      }),
      ctx,
    );

    expect(mail.subject).toContain("GRP-10001");
    expect(mail.html).toContain("1.250,00 TL");
    expect(mail.html).toContain("ali_k");
    expect(mail.html).toContain(
      "https://admin.tarodan.com.tr/operations/orders/o1",
    );
  });

  it("olay değerlerini HTML'e kaçışlı basar", () => {
    const mail = renderInternalNotice(
      "order.cancelled",
      orderCancelledNotice({
        orderId: "o1",
        orderNumber: "ORD-1",
        cancelledBy: "buyer",
        reason: "<script>alert(1)</script>",
      }),
      ctx,
    );

    expect(mail.html).not.toContain("<script>alert(1)</script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("konu satırında satır sonu kalmaz (başlık enjeksiyonu)", () => {
    const mail = renderInternalNotice(
      "order.paid",
      { ref: "GRP-1\r\nBcc: x@y.z", facts: [], adminPath: "/x" },
      ctx,
    );
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

describe("kişisel veri: personel postası mesaj gövdesi taşımaz", () => {
  it("misafir mesajı yalnız kısa alıntıyla girer, tamamı panelde", () => {
    const longMessage = `${"a".repeat(500)} TR12 0006 1005 1978 6457 8413 26`;
    const notice = guestMessageNotice({
      referenceNumber: "ILT-1",
      name: "Ayşe",
      email: "ayse@example.com\r\nBcc: x@y.z",
      subject: "Soru",
      message: longMessage,
    });

    const message = notice.facts.find((f) => f.label === "message");
    expect(message && "value" in message ? message.value.length : 0).toBe(
      MAIL_NOTICE_EXCERPT_LENGTH,
    );
    expect(JSON.stringify(notice)).not.toContain("TR12 0006");
    expect(notice.replyTo).not.toMatch(/[\r\n]/);
  });
});

describe("renderInternalDigest", () => {
  it("alanın olaylarını tek e-postada, olay sayısıyla toplar", () => {
    const notices = ["GRP-1", "GRP-2", "GRP-3"].map((ref) => ({
      eventId: "order.paid" as const,
      notice: { ref, facts: [], adminPath: "/operations/orders" },
      occurredAt: new Date("2026-10-06T06:00:00Z"),
    }));

    const mail = renderInternalDigest("order", "daily", notices, ctx);

    expect(mail.subject).toContain("3");
    for (const ref of ["GRP-1", "GRP-2", "GRP-3"]) {
      expect(mail.html).toContain(ref);
    }
  });
});
