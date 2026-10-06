/**
 * Mail Yönlendirme — gönderen çözümü (SmtpProvider).
 *
 * Şablon → alan → kutu: alanına kutu atanmış e-posta O kutunun kendi SMTP
 * oturumuyla, `"Ad" <kutu>` From'u ve alanın Reply-To'suyla gider. Kutu
 * oturum/bağlantı hatası verirse e-posta varsayılan kimlikle yeniden gönderilir
 * (müşteri postası düşmez) ve hata kutuya yazılır. EmailLog.from gerçekten
 * kullanılan adresi taşır.
 */
import type { MailAreaId } from "@tarodan/types";
import { SmtpProvider, SENDER_ACCOUNT_COOLDOWN_MS } from "./smtp.provider";
import {
  defaultAreaRouting,
  type MailAreaRouting,
  type MailRoutingSnapshot,
  type MailSenderAccountRecord,
} from "./mail-routing-directory";

type FakeTransport = {
  user: string;
  sendMail: jest.Mock;
  close: jest.Mock;
  verify: jest.Mock;
};

const created: FakeTransport[] = [];
/** Kullanıcı adına göre bir sonraki transport'un sendMail davranışı. */
const behaviour = new Map<string, () => Promise<unknown>>();

jest.mock("nodemailer", () => ({
  createTransport: (options: { auth?: { user: string } }) => {
    const user = options.auth?.user ?? "";
    const transport: FakeTransport = {
      user,
      sendMail: jest.fn(
        () =>
          behaviour.get(user)?.() ??
          Promise.resolve({ messageId: `mid-${user}` }),
      ),
      close: jest.fn(),
      verify: jest.fn(),
    };
    created.push(transport);
    return transport;
  },
}));

const ORDER_ACCOUNT: MailSenderAccountRecord = {
  id: "acc-order",
  address: "siparis@tarodan.com.tr",
  displayName: "Tarodan Sipariş",
  host: null,
  port: null,
  secure: null,
  username: "siparis@tarodan.com.tr",
  passwordEncrypted: "v1:enc",
  lastTestOk: null,
};

function snapshotWith(
  areas: Partial<Record<MailAreaId, Partial<MailAreaRouting>>>,
  accounts: MailSenderAccountRecord[] = [ORDER_ACCOUNT],
): MailRoutingSnapshot {
  return {
    accounts: new Map(accounts.map((a) => [a.id, a])),
    areas: new Map(
      (
        Object.entries(areas) as Array<[MailAreaId, Partial<MailAreaRouting>]>
      ).map(([area, routing]) => [
        area,
        { ...defaultAreaRouting(area), ...routing },
      ]),
    ),
  };
}

function build(snapshot: MailRoutingSnapshot | Error) {
  created.length = 0;
  behaviour.clear();
  const emailLog = { create: jest.fn().mockResolvedValue({}) };
  const routing = {
    snapshot: jest.fn(() =>
      snapshot instanceof Error
        ? Promise.reject(snapshot)
        : Promise.resolve(snapshot),
    ),
    passwordOf: jest.fn(() => "mailbox-pass"),
    recordAccountResult: jest.fn().mockResolvedValue(undefined),
    clearAccountFailure: jest.fn().mockResolvedValue(undefined),
  };
  const env: Record<string, string> = {
    SMTP_HOST: "mail.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "info@tarodan.com.tr",
    SMTP_PASS: "default-pass",
    MAIL_FROM: "Tarodan <info@tarodan.com.tr>",
  };
  const provider = new SmtpProvider(
    { get: (key: string, fallback?: string) => env[key] ?? fallback } as never,
    { emailLog } as never,
    routing as never,
  );
  const defaultTransport = created[0];
  const accountTransport = () =>
    created.find((t) => t.user === ORDER_ACCOUNT.username);
  const loggedRow = (index = 0) => emailLog.create.mock.calls[index][0].data;
  return {
    provider,
    routing,
    emailLog,
    defaultTransport,
    accountTransport,
    loggedRow,
  };
}

const orderMail = {
  to: "buyer@example.com",
  subject: "Siparişiniz alındı",
  html: "<p>x</p>",
  template: "order-paid",
};

describe("SmtpProvider — Mail Yönlendirme gönderen çözümü", () => {
  it("alanına kutu atanmış şablon o kutunun oturumundan, kendi From ve Reply-To'suyla gider", async () => {
    const t = build(
      snapshotWith({
        order: {
          account: ORDER_ACCOUNT,
          replyTo: "destek@tarodan.com.tr",
        },
      }),
    );

    const result = await t.provider.sendEmail(orderMail);

    expect(result.success).toBe(true);
    const mail = t.accountTransport()!.sendMail.mock.calls[0][0];
    expect(mail.from).toEqual({
      name: "Tarodan Sipariş",
      address: "siparis@tarodan.com.tr",
    });
    expect(mail.replyTo).toBe("destek@tarodan.com.tr");
    expect(t.defaultTransport.sendMail).not.toHaveBeenCalled();
    expect(t.loggedRow().from).toBe(
      '"Tarodan Sipariş" <siparis@tarodan.com.tr>',
    );
    expect(t.loggedRow().status).toBe("sent");
  });

  it("alanın görünen ad ezmesi kutunun adının yerine geçer", async () => {
    const t = build(
      snapshotWith({
        order: { account: ORDER_ACCOUNT, displayName: "Tarodan Siparişler" },
      }),
    );

    await t.provider.sendEmail(orderMail);

    expect(t.accountTransport()!.sendMail.mock.calls[0][0].from.name).toBe(
      "Tarodan Siparişler",
    );
  });

  it("kutunun oturumu kurulur: kullanıcı adı + çözülmüş şifre, host yoksa env'inki", async () => {
    const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));

    await t.provider.sendEmail(orderMail);

    expect(t.routing.passwordOf).toHaveBeenCalledWith(ORDER_ACCOUNT);
    expect(t.accountTransport()).toBeDefined();
  });

  it("şablonsuz (ad hoc) e-posta varsayılan kimlikle gider", async () => {
    const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));

    await t.provider.sendEmail({ to: "a@b.c", subject: "Konu", html: "x" });

    expect(t.defaultTransport.sendMail.mock.calls[0][0].from).toBe(
      "Tarodan <info@tarodan.com.tr>",
    );
    expect(t.accountTransport()).toBeUndefined();
    expect(t.loggedRow().from).toBe("Tarodan <info@tarodan.com.tr>");
  });

  it("şablonsuz gönderim alanı açıkça verebilir (pazarlama/fatura)", async () => {
    const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));

    await t.provider.sendEmail({
      to: "a@b.c",
      subject: "Konu",
      html: "x",
      area: "order",
    });

    expect(t.accountTransport()!.sendMail).toHaveBeenCalledTimes(1);
  });

  it("alanına kutu atanmamış şablon varsayılan kimlikle gider, alanın Reply-To'su yine uygulanır", async () => {
    const t = build(
      snapshotWith({ order: { replyTo: "siparis@tarodan.com.tr" } }),
    );

    await t.provider.sendEmail(orderMail);

    const mail = t.defaultTransport.sendMail.mock.calls[0][0];
    expect(mail.from).toBe("Tarodan <info@tarodan.com.tr>");
    expect(mail.replyTo).toBe("siparis@tarodan.com.tr");
  });

  it("çağıranın Reply-To'su alanınkini ezer (misafir mesajında müşteri adresi)", async () => {
    const t = build(
      snapshotWith({
        order: { account: ORDER_ACCOUNT, replyTo: "destek@tarodan.com.tr" },
      }),
    );

    await t.provider.sendEmail({ ...orderMail, replyTo: "guest@example.com" });

    expect(t.accountTransport()!.sendMail.mock.calls[0][0].replyTo).toBe(
      "guest@example.com",
    );
  });

  it("List-Unsubscribe başlıkları kutu yolunda da korunur", async () => {
    const t = build(snapshotWith({ marketing: { account: ORDER_ACCOUNT } }));
    const headers = {
      "List-Unsubscribe": "<https://tarodan.com.tr/u?t=1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    await t.provider.sendEmail({
      to: "a@b.c",
      subject: "Bülten",
      html: "x",
      template: "marketing-newsletter",
      headers,
    });

    expect(t.accountTransport()!.sendMail.mock.calls[0][0].headers).toEqual(
      headers,
    );
  });

  describe("kutu hatası → varsayılan kimliğe düşüş", () => {
    const authError = Object.assign(new Error("Invalid login: 535 failed"), {
      code: "EAUTH",
      command: "AUTH PLAIN",
    });

    it("oturum reddedilirse e-posta varsayılan kimlikle gider, hata kutuya yazılır", async () => {
      const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
      behaviour.set(ORDER_ACCOUNT.username, () => Promise.reject(authError));

      const result = await t.provider.sendEmail(orderMail);

      expect(result.success).toBe(true);
      expect(t.defaultTransport.sendMail).toHaveBeenCalledTimes(1);
      expect(t.routing.recordAccountResult).toHaveBeenCalledWith(
        ORDER_ACCOUNT.id,
        false,
        expect.stringContaining("Invalid login"),
      );
      // Kayıt gerçekten kullanılan adresi taşır.
      expect(t.emailLog.create).toHaveBeenCalledTimes(1);
      expect(t.loggedRow().from).toBe("Tarodan <info@tarodan.com.tr>");
      expect(t.loggedRow().metadata).toEqual({
        senderFallbackFrom: ORDER_ACCOUNT.address,
      });
    });

    it("sunucu From'u reddederse (MAIL FROM) de düşer", async () => {
      const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
      behaviour.set(ORDER_ACCOUNT.username, () =>
        Promise.reject(
          Object.assign(new Error("553 sender rejected"), {
            command: "MAIL FROM",
          }),
        ),
      );

      await expect(t.provider.sendEmail(orderMail)).resolves.toMatchObject({
        success: true,
      });
      expect(t.defaultTransport.sendMail).toHaveBeenCalledTimes(1);
    });

    it("şifre çözülemezse (anahtar değişti) gönderim denenmeden düşer", async () => {
      const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
      t.routing.passwordOf.mockImplementation(() => {
        throw new Error("Unsupported state or unable to authenticate data");
      });

      const result = await t.provider.sendEmail(orderMail);

      expect(result.success).toBe(true);
      expect(t.defaultTransport.sendMail).toHaveBeenCalledTimes(1);
      expect(t.routing.recordAccountResult).toHaveBeenCalledWith(
        ORDER_ACCOUNT.id,
        false,
        expect.any(String),
      );
    });

    it("alıcı reddi kutu hatası sayılmaz: yeniden gönderilmez, başarısız döner", async () => {
      const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
      behaviour.set(ORDER_ACCOUNT.username, () =>
        Promise.reject(
          Object.assign(new Error("550 mailbox unavailable"), {
            command: "RCPT TO",
          }),
        ),
      );

      const result = await t.provider.sendEmail(orderMail);

      expect(result.success).toBe(false);
      expect(t.defaultTransport.sendMail).not.toHaveBeenCalled();
      expect(t.routing.recordAccountResult).not.toHaveBeenCalled();
      expect(t.loggedRow().status).toBe("failed");
      expect(t.loggedRow().from).toBe(
        '"Tarodan Sipariş" <siparis@tarodan.com.tr>',
      );
    });

    it("hatalı kutu soğuma süresince yeniden denenmez", async () => {
      const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
      behaviour.set(ORDER_ACCOUNT.username, () => Promise.reject(authError));

      await t.provider.sendEmail(orderMail);
      const accountAttempts = created
        .filter((tr) => tr.user === ORDER_ACCOUNT.username)
        .reduce((sum, tr) => sum + tr.sendMail.mock.calls.length, 0);
      await t.provider.sendEmail(orderMail);
      const afterSecond = created
        .filter((tr) => tr.user === ORDER_ACCOUNT.username)
        .reduce((sum, tr) => sum + tr.sendMail.mock.calls.length, 0);

      expect(accountAttempts).toBe(1);
      expect(afterSecond).toBe(1);
      expect(t.defaultTransport.sendMail).toHaveBeenCalledTimes(2);
    });

    it("soğuma bitince kutu yeniden denenir", async () => {
      const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
      behaviour.set(ORDER_ACCOUNT.username, () => Promise.reject(authError));
      const now = jest.spyOn(Date, "now");
      now.mockReturnValue(1_000_000);

      await t.provider.sendEmail(orderMail);
      behaviour.delete(ORDER_ACCOUNT.username);
      now.mockReturnValue(1_000_000 + SENDER_ACCOUNT_COOLDOWN_MS + 1);
      await t.provider.sendEmail(orderMail);
      now.mockRestore();

      const accountAttempts = created
        .filter((tr) => tr.user === ORDER_ACCOUNT.username)
        .reduce((sum, tr) => sum + tr.sendMail.mock.calls.length, 0);
      expect(accountAttempts).toBe(2);
      expect(t.defaultTransport.sendMail).toHaveBeenCalledTimes(1);
    });
  });

  it("yönlendirme okunamazsa e-posta varsayılan kimlikle gider", async () => {
    const t = build(new Error("db down"));

    const result = await t.provider.sendEmail(orderMail);

    expect(result.success).toBe(true);
    expect(t.defaultTransport.sendMail).toHaveBeenCalledTimes(1);
  });

  it("bağlantı ayarı değişince oturum yeniden kurulur, eskisi kapanır", async () => {
    const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
    await t.provider.sendEmail(orderMail);
    const first = t.accountTransport()!;

    const changed = { ...ORDER_ACCOUNT, passwordEncrypted: "v1:new" };
    t.routing.snapshot.mockResolvedValue(
      snapshotWith({ order: { account: changed } }, [changed]),
    );
    await t.provider.sendEmail(orderMail);

    expect(first.close).toHaveBeenCalled();
    const accountTransports = created.filter(
      (tr) => tr.user === ORDER_ACCOUNT.username,
    );
    expect(accountTransports).toHaveLength(2);
  });

  it("silinmiş kutunun oturumu bir sonraki gönderimde kapatılır", async () => {
    const t = build(snapshotWith({ order: { account: ORDER_ACCOUNT } }));
    await t.provider.sendEmail(orderMail);
    const pooled = t.accountTransport()!;

    t.routing.snapshot.mockResolvedValue(snapshotWith({}, []));
    await t.provider.sendEmail(orderMail);

    expect(pooled.close).toHaveBeenCalled();
    expect(t.defaultTransport.sendMail).toHaveBeenCalledTimes(1);
  });

  describe("sendThroughAccount (admin test gönderimi)", () => {
    const message = { to: "admin@tarodan.com.tr", subject: "Test", html: "x" };

    it("kutunun kendi oturumuyla gönderir ve başarıyı kutuya yazar", async () => {
      const t = build(snapshotWith({}));

      const result = await t.provider.sendThroughAccount(
        ORDER_ACCOUNT,
        message,
      );

      expect(result).toEqual({ ok: true, error: null });
      expect(t.accountTransport()!.sendMail).toHaveBeenCalledTimes(1);
      expect(t.routing.recordAccountResult).toHaveBeenCalledWith(
        ORDER_ACCOUNT.id,
        true,
        null,
      );
    });

    it("hata verirse varsayılan kimliğe DÜŞMEZ; hatayı döner ve yazar", async () => {
      const t = build(snapshotWith({}));
      behaviour.set(ORDER_ACCOUNT.username, () =>
        Promise.reject(
          Object.assign(new Error("Invalid login"), { code: "EAUTH" }),
        ),
      );

      const result = await t.provider.sendThroughAccount(
        ORDER_ACCOUNT,
        message,
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Invalid login");
      expect(t.defaultTransport.sendMail).not.toHaveBeenCalled();
      expect(t.routing.recordAccountResult).toHaveBeenCalledWith(
        ORDER_ACCOUNT.id,
        false,
        expect.stringContaining("Invalid login"),
      );
    });

    it("alıcı reddi kutunun sağlığına DOKUNMAZ; çağırana ok:false + hata döner", async () => {
      const t = build(snapshotWith({}));
      behaviour.set(ORDER_ACCOUNT.username, () =>
        Promise.reject(
          Object.assign(new Error("550 5.1.1 mailbox unavailable"), {
            command: "RCPT TO",
            responseCode: 550,
          }),
        ),
      );

      const result = await t.provider.sendThroughAccount(
        ORDER_ACCOUNT,
        message,
      );

      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining("mailbox unavailable"),
      });
      expect(t.routing.recordAccountResult).not.toHaveBeenCalled();
    });
  });

  describe("sağlık işareti — yalnız geçişte yazılır", () => {
    it("hatalı işaretli kutudan başarılı gönderim işareti kaldırır", async () => {
      const flagged = { ...ORDER_ACCOUNT, lastTestOk: false };
      const t = build(snapshotWith({ order: { account: flagged } }, [flagged]));

      await t.provider.sendEmail(orderMail);

      expect(t.routing.clearAccountFailure).toHaveBeenCalledWith(flagged.id);
      expect(t.routing.recordAccountResult).not.toHaveBeenCalled();
    });

    it("sağlıklı (ya da hiç test edilmemiş) kutunun her gönderiminde yazım yok", async () => {
      for (const lastTestOk of [true, null]) {
        const healthy = { ...ORDER_ACCOUNT, lastTestOk };
        const t = build(
          snapshotWith({ order: { account: healthy } }, [healthy]),
        );

        await t.provider.sendEmail(orderMail);
        await t.provider.sendEmail(orderMail);

        expect(t.routing.clearAccountFailure).not.toHaveBeenCalled();
        expect(t.routing.recordAccountResult).not.toHaveBeenCalled();
      }
    });
  });
});
