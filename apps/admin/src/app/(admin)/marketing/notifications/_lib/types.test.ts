import { describe, expect, it } from "vitest";
import {
  emptySendForm,
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
