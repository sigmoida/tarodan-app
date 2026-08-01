import { SmtpProvider } from "./smtp.provider";

/**
 * HER e-posta kaydedilmeli. Eskiden `EmailLog`'a yazan TEK yer email worker'ıydı
 * ve o worker'ı besleyen kuyruğun tek çağıranı admin panelindeki "test
 * e-postası gönder" aksiyonuydu. Gerçek e-postaların tamamı (doğrulama, şifre
 * sıfırlama, sipariş, fatura, payout, pazarlama) doğrudan `sendEmail`'e gidip
 * hiç loglanmıyordu; Loglar → E-postalar sekmesi boş duruyor, operatör
 * "e-posta tarafında sorun yok" sanıyordu.
 *
 * `sendEmail` tek hunidir (11 çağrı yerinin hepsi buradan geçer, ikinci bir
 * transport yok) — kayıt buraya alınır.
 */
describe("SmtpProvider — her gönderim EmailLog'a yazılır", () => {
  const makeProvider = (opts: {
    enabled: boolean;
    sendResult?: "ok" | "throw";
    logThrows?: boolean;
  }) => {
    const create = jest.fn((_args: { data: Record<string, any> }) =>
      opts.logThrows
        ? Promise.reject(new Error("db down"))
        : Promise.resolve({ id: "log-1" }),
    );
    const prisma = { emailLog: { create } } as any;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          SMTP_HOST: opts.enabled ? "smtp.test" : undefined,
          SMTP_PORT: 587,
          SMTP_USER: opts.enabled ? "user" : undefined,
          SMTP_PASSWORD: opts.enabled ? "pass" : undefined,
          MAIL_FROM: "no-reply@tarodan.test",
        };
        return values[key] ?? fallback;
      }),
    } as any;

    const provider = new SmtpProvider(config, prisma);
    if (opts.enabled) {
      (provider as any).transporter = {
        sendMail: jest.fn(() =>
          opts.sendResult === "throw"
            ? Promise.reject(new Error("mailbox full"))
            : Promise.resolve({ messageId: "mid-1" }),
        ),
      };
    }
    return { provider, create };
  };

  const options = {
    to: "user@example.com",
    subject: "Şifre sıfırlama",
    html: "<p>x</p>",
    template: "password-reset",
    userId: "u-1",
  };

  it("başarılı gönderimi 'sent' olarak kaydeder", async () => {
    const { provider, create } = makeProvider({ enabled: true });

    const res = await provider.sendEmail(options);

    expect(res.success).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data;
    expect(row).toMatchObject({
      to: "user@example.com",
      subject: "Şifre sıfırlama",
      status: "sent",
      provider: "smtp",
      messageId: "mid-1",
      template: "password-reset",
      userId: "u-1",
    });
    expect(row.from).toBe("no-reply@tarodan.test");
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  it("başarısız gönderimi 'failed' + hata mesajıyla kaydeder", async () => {
    const { provider, create } = makeProvider({
      enabled: true,
      sendResult: "throw",
    });

    const res = await provider.sendEmail(options);

    expect(res.success).toBe(false);
    const row = create.mock.calls[0][0].data;
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toContain("mailbox full");
    expect(row.sentAt).toBeUndefined();
  });

  it("mock modda da kaydeder (provider='mock')", async () => {
    const { provider, create } = makeProvider({ enabled: false });

    const res = await provider.sendEmail(options);

    expect(res.success).toBe(true);
    expect(create.mock.calls[0][0].data).toMatchObject({
      status: "sent",
      provider: "mock",
    });
  });

  it("log yazımı patlarsa gönderim SONUCU bozulmaz", async () => {
    const { provider } = makeProvider({ enabled: true, logThrows: true });

    // Kayıt best-effort: e-posta gönderildiyse başarı döner.
    await expect(provider.sendEmail(options)).resolves.toMatchObject({
      success: true,
    });
  });

  it("template/userId verilmese de kaydeder (opsiyonel alanlar)", async () => {
    const { provider, create } = makeProvider({ enabled: true });

    await provider.sendEmail({ to: "a@b.c", subject: "Konu" });

    const row = create.mock.calls[0][0].data;
    expect(row.template).toBeUndefined();
    expect(row.userId).toBeUndefined();
    expect(row.status).toBe("sent");
  });
});
