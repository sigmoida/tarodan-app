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
    expect(paths).toEqual(expect.arrayContaining(["emailSubject", "emailHtml"]));
  });

  it("email + dolu konu/HTML geçerli; yalnız e-posta (push yok) da çalışır", () => {
    const result = schema.safeParse(
      form({ channels: ["email"], emailSubject: "Konu", emailHtml: "<p>x</p>" }),
    );
    expect(result.success).toBe(true);
  });

  it("boşluktan ibaret HTML kabul edilmez", () => {
    const result = schema.safeParse(
      form({ channels: ["email"], emailSubject: "Konu", emailHtml: "   " }),
    );
    expect(result.success).toBe(false);
  });

  it("varsayılan gönderim türü duyurudur", () => {
    expect(emptySendForm.mailingType).toBe("announcement");
  });
});

describe("sendFormToPayload", () => {
  it("yalnız push: e-posta alanları payload'a girmez", () => {
    const payload = sendFormToPayload(
      form({ channels: ["push"], emailSubject: "x", emailHtml: "<p>x</p>" }),
    );
    expect(payload).not.toHaveProperty("emailHtml");
    expect(payload).not.toHaveProperty("emailSubject");
    expect(payload).not.toHaveProperty("mailingType");
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
