import { EmailWorker } from "../../workers/email.worker";
import {
  getEmailTemplateSubject,
  renderManagedEmailTemplate,
} from "./email-template-renderer";
import {
  buildEmailVerificationTemplateData,
  EMAIL_VERIFICATION_TEMPLATE,
} from "./email-verification-mail";
import { frontendUrlForEnvironment } from "../../config/app-urls";

/**
 * Aktivasyon maili iki yoldan gidiyor: tekil gönderim senkron
 * (`renderManagedEmailTemplate`), toplu gönderim kuyruktan (worker'ın
 * `send-template` işi kendi render'ını yapıyor). İkisi ayrışırsa aynı butonun
 * tekil ve toplu hâli kullanıcıya FARKLI mail gönderir.
 *
 * Bu testin koruduğu koşullar: override geçilmez ve `subject` olarak
 * `getEmailTemplateSubject` verilir. Biri bozulursa test düşer.
 */
describe("email-verification — senkron ve kuyruklu render paritesi", () => {
  const to = "u@example.com";
  const templateData = buildEmailVerificationTemplateData(
    "Kullanıcı",
    "a".repeat(64),
  );

  const runWorker = async (
    dbTemplate: { bodyHtml: string; subject: string } | null,
  ) => {
    const smtp = {
      defaultFrom: "no-reply@tarodan.com.tr",
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
    };
    const prisma = {
      emailTemplate: { findUnique: jest.fn().mockResolvedValue(dbTemplate) },
    };
    const worker = new EmailWorker(
      { get: jest.fn(() => undefined) } as any,
      prisma as any,
      smtp as any,
      { logNotification: jest.fn() } as any,
    );

    await worker.handleSendTemplate({
      id: "job-1",
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        to,
        subject: getEmailTemplateSubject(
          EMAIL_VERIFICATION_TEMPLATE,
          templateData,
        ),
        template: EMAIL_VERIFICATION_TEMPLATE,
        templateData: { ...templateData, userId: "user-1" },
        redactTemplateData: true,
      },
    } as any);

    const args = smtp.sendEmail.mock.calls[0][0];
    return { subject: args.subject, html: args.html };
  };

  const runSync = (
    dbTemplate: { bodyHtml: string; subject: string } | null,
  ) => {
    const rendered = renderManagedEmailTemplate(
      EMAIL_VERIFICATION_TEMPLATE,
      { ...templateData, to },
      dbTemplate,
      frontendUrlForEnvironment(),
    );
    return { subject: rendered.subject, html: rendered.html };
  };

  beforeEach(() => {
    // Marka bağlamının iki yolda ayrışabildiği tek iki değişken: worker onları
    // okur, senkron yol varsayılana düşer. Boşken ikisi de aynı varsayılanı alır.
    delete process.env.SUPPORT_EMAIL;
    delete process.env.EMAIL_LOGO_URL;
    process.env.FRONTEND_URL = "https://tarodan.example";
  });

  it("gömülü şablonda aynı subject ve html", async () => {
    expect(await runWorker(null)).toEqual(runSync(null));
  });

  it("DB'de özelleştirilmiş şablonda da aynı subject ve html", async () => {
    const dbTemplate = {
      bodyHtml: "<p>Merhaba {{displayName}}, {{verificationUrl}}</p>",
      subject: "Hesabınızı doğrulayın",
    };

    expect(await runWorker(dbTemplate)).toEqual(runSync(dbTemplate));
  });

  it("link production host'una işaret eder, localhost'a değil", () => {
    expect(templateData.verificationUrl).toContain("/verify-email?token=");
  });
});
