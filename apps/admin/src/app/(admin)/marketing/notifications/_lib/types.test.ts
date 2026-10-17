import { describe, expect, it } from "vitest";
import {
  emptySendForm,
  htmlToPlainText,
  scheduleFormToPayload,
  sendFormToPayload,
  sendNotificationSchema,
  type SendForm,
} from "./types";

const t = ((key: string) => key) as never;
const schema = sendNotificationSchema(t);

const form = (extra: Partial<SendForm> = {}): SendForm => ({
  ...emptySendForm,
  title: "Başlık",
  body: "Gövde",
  mailingType: "announcement",
  ...extra,
});

describe("sendNotificationSchema — e-posta alanları", () => {
  it("yalnız push: e-posta alanları zorunlu değil", () => {
    expect(schema.safeParse(form({ channels: ["push"] })).success).toBe(true);
  });

  it("email seçiliyken konu ve HTML zorunlu", () => {
    const result = schema.safeParse(form({ channels: ["email"] }));
    expect(result.success).toBe(false);
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(
      expect.arrayContaining(["emailSubject", "emailHtml"]),
    );
  });

  it("email + dolu konu/HTML geçerli; yalnız e-posta (push yok) da çalışır", () => {
    const result = schema.safeParse(
      form({
        channels: ["email"],
        emailSubject: "Konu",
        emailHtml: "<p>x</p>",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("boşluktan ibaret HTML kabul edilmez", () => {
    const result = schema.safeParse(
      form({ channels: ["email"], emailSubject: "Konu", emailHtml: "   " }),
    );
    expect(result.success).toBe(false);
  });
});

// S1 — Apple 4.5.4 / İYS: tür her gönderimde açıkça seçilir ve kanaldan
// bağımsız gider (pazarlama push + bildirim kutusunu da süzer).
describe("sendNotificationSchema — bildirim türü", () => {
  it("boş formda tür seçili değildir", () => {
    expect(emptySendForm.mailingType).toBe("");
  });

  it("tür seçilmeden gönderilemez (yalnız push'ta da)", () => {
    const result = schema.safeParse(
      form({ channels: ["push"], mailingType: "" }),
    );
    expect(result.success).toBe(false);
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain("mailingType");
  });

  it.each(["announcement", "marketing"] as const)(
    "%s seçiliyse geçerli",
    (mailingType) => {
      expect(
        schema.safeParse(form({ channels: ["push"], mailingType })).success,
      ).toBe(true);
    },
  );
});

describe("sendFormToPayload", () => {
  it("yalnız push: e-posta alanları payload'a girmez, tür girer", () => {
    const payload = sendFormToPayload(
      form({
        channels: ["push"],
        emailSubject: "x",
        emailHtml: "<p>x</p>",
        mailingType: "marketing",
      }),
    );
    expect(payload).not.toHaveProperty("emailHtml");
    expect(payload).not.toHaveProperty("emailSubject");
    expect(payload.mailingType).toBe("marketing");
  });

  it("seçilmemiş tür payload'a boş dize olarak gitmez", () => {
    expect(sendFormToPayload(form({ mailingType: "" })).mailingType).toBe(
      undefined,
    );
  });

  it("email seçiliyse konu, HTML ve tür gider (zamanlamada da aynı payload)", () => {
    const payload = sendFormToPayload(
      form({
        channels: ["push", "email"],
        emailSubject: "Konu",
        emailHtml: "<p>x</p>",
        mailingType: "marketing",
      }),
    );
    expect(payload).toMatchObject({
      channels: ["push", "email"],
      emailSubject: "Konu",
      emailHtml: "<p>x</p>",
      mailingType: "marketing",
    });
  });
});

describe("hedef link (data.link)", () => {
  it("boşsa payload'a data girmez", () => {
    expect(sendFormToPayload(form({ link: "" }))).not.toHaveProperty("data");
  });

  it("site içi yol data.link olarak gider", () => {
    expect(sendFormToPayload(form({ link: " /listings/abc " }))).toMatchObject({
      data: { link: "/listings/abc" },
    });
  });

  it.each([
    "/listings/abc",
    "/profile/orders",
    "/membership",
    "/collections/c1",
  ])("%s geçerli", (link) => {
    expect(schema.safeParse(form({ link })).success).toBe(true);
  });

  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "/olmayan-sayfa",
    "javascript:alert(1)",
  ])("%s reddedilir", (link) => {
    const result = schema.safeParse(form({ link }));
    expect(result.success).toBe(false);
  });
});

const issuePaths = (values: SendForm) => {
  const result = schema.safeParse(values);
  return result.success ? [] : result.error.issues.map((i) => i.path[0]);
};

describe("kanal başına doğrulama — yalnız görünen kartlar", () => {
  it("yalnız e-posta: push başlığı/gövdesi/linki doğrulanmaz", () => {
    const paths = issuePaths(
      form({
        channels: ["email"],
        title: "",
        body: "",
        link: "javascript:alert(1)",
        emailSubject: "Konu",
        emailHtml: "<p>x</p>",
      }),
    );
    expect(paths).toEqual([]);
  });

  it.each([["push"], ["in_app"]] as const)(
    "%s seçiliyse başlık ve gövde zorunlu",
    (channel) => {
      const paths = issuePaths(
        form({ channels: [channel], title: "", body: "" }),
      );
      expect(paths).toEqual(expect.arrayContaining(["title", "body"]));
    },
  );

  it("push + e-posta: iki kartın alanları da zorunlu", () => {
    const paths = issuePaths(
      form({ channels: ["push", "email"], title: "", body: "" }),
    );
    expect(paths).toEqual(
      expect.arrayContaining(["title", "body", "emailSubject", "emailHtml"]),
    );
  });

  it("kanal seçilmeden gönderilemez", () => {
    expect(issuePaths(form({ channels: [] }))).toContain("channels");
  });

  it("varsayılan kanallar push + zil (eski davranış)", () => {
    expect(emptySendForm.channels).toEqual(["push", "in_app"]);
  });
});

describe("zamanlama", () => {
  it("şimdi gönder: tarih istenmez", () => {
    expect(issuePaths(form({ sendMode: "now", scheduledFor: "" }))).toEqual([]);
  });

  it("zamanla: tarih zorunlu ve gelecekte olmalı", () => {
    expect(issuePaths(form({ sendMode: "schedule" }))).toContain(
      "scheduledFor",
    );
    expect(
      issuePaths(
        form({ sendMode: "schedule", scheduledFor: "2000-01-01T10:00" }),
      ),
    ).toContain("scheduledFor");
    expect(
      issuePaths(
        form({ sendMode: "schedule", scheduledFor: "2999-01-01T10:00" }),
      ),
    ).toEqual([]);
  });

  it("zamanlama payload'ı gönderimle aynı içerik + ISO tarih", () => {
    const values = form({
      sendMode: "schedule",
      scheduledFor: "2999-01-01T10:00",
      channels: ["email"],
      emailSubject: "Konu",
      emailHtml: "<p>x</p>",
    });
    const payload = scheduleFormToPayload(values);
    expect(payload).toMatchObject(sendFormToPayload(values));
    expect(payload.scheduledFor).toBe(
      new Date("2999-01-01T10:00").toISOString(),
    );
    // Form yardımcı alanları API'ye sızmaz.
    expect(payload).not.toHaveProperty("sendMode");
    expect(payload).not.toHaveProperty("users");
  });
});

describe("sendFormToPayload — seçilmeyen kanallar gönderilmez", () => {
  it("yalnız e-posta: zil kapalı, push metni ve link gitmez", () => {
    const payload = sendFormToPayload(
      form({
        channels: ["email"],
        title: "Gizli push başlığı",
        body: "Gizli push gövdesi",
        link: "/listings/abc",
        emailSubject: "Kampanya konusu",
        emailHtml: "<h1>Merhaba</h1><p>Yeni &amp; güzel</p>",
      }),
    );
    expect(payload.channels).toEqual(["email"]);
    expect(payload.inApp).toBe(false);
    expect(payload).not.toHaveProperty("data");
    // Zorunlu API alanları e-postadan türetilir; gizli kartın metni gitmez.
    expect(payload.title).toBe("Kampanya konusu");
    expect(payload.body).toBe("Merhaba Yeni & güzel");
  });

  it("yalnız zil: inApp true, e-posta alanları yok", () => {
    const payload = sendFormToPayload(
      form({
        channels: ["in_app"],
        emailSubject: "x",
        emailHtml: "<p>x</p>",
      }),
    );
    expect(payload).toMatchObject({
      channels: ["in_app"],
      inApp: true,
      title: "Başlık",
      body: "Gövde",
    });
    expect(payload).not.toHaveProperty("emailHtml");
  });

  it("push (zil yok): inApp false gider", () => {
    expect(sendFormToPayload(form({ channels: ["push"] })).inApp).toBe(false);
  });

  it("kanal sırası sabittir (push, in_app, email)", () => {
    expect(
      sendFormToPayload(
        form({
          channels: ["email", "in_app", "push"],
          emailSubject: "K",
          emailHtml: "<p>x</p>",
        }),
      ).channels,
    ).toEqual(["push", "in_app", "email"]);
  });

  it("yalnız e-postada uzun konu ve gövde API sınırına kırpılır", () => {
    const payload = sendFormToPayload(
      form({
        channels: ["email"],
        emailSubject: "K".repeat(120),
        emailHtml: `<p>${"a ".repeat(400)}</p>`,
      }),
    );
    expect(payload.title.length).toBeLessThanOrEqual(65);
    expect(payload.body.length).toBeLessThanOrEqual(240);
  });
});

describe("htmlToPlainText", () => {
  it("etiketleri, stil/script bloklarını atar ve varlıkları çözer", () => {
    expect(
      htmlToPlainText(
        "<style>p{color:red}</style><p>Merhaba&nbsp;<b>dünya</b></p><script>x()</script>&#33;",
      ),
    ).toBe("Merhaba dünya !");
  });
});
