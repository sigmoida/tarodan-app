import * as crypto from "crypto";
import { AuthRegistrationService } from "./auth-registration.service";

/**
 * Toplu aktivasyon maili kuyruğa alınır, senkron gönderilmez. Kuyruğa yazılan
 * linkin DB'deki kayıtla eşleşmesi bu yolun TEK kritik invaryantı: token
 * mail'e HAM, veritabanına sha256 olarak gider.
 */
describe("AuthRegistrationService — aktivasyon maili kuyruğu", () => {
  const baseUser = {
    id: "user-1",
    email: "u@example.com",
    displayName: "Kullanıcı",
    isEmailVerified: false,
  };

  const makeService = (user: Record<string, unknown> | null = baseUser) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      emailVerificationToken: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const notificationService = {
      sendEmailVerification: jest.fn().mockResolvedValue({ success: true }),
    };
    const emailQueue = { add: jest.fn().mockResolvedValue({ id: "job-1" }) };
    const service = new AuthRegistrationService(
      prisma as any,
      notificationService as any,
      undefined as any,
      undefined as any,
      emailQueue as any,
    );
    return { service, prisma, notificationService, emailQueue };
  };

  it("maildeki HAM token, DB'ye yazılan sha256 özetiyle eşleşir", async () => {
    const { service, prisma, emailQueue } = makeService();

    await service.queueEmailVerification("user-1");

    const job = emailQueue.add.mock.calls[0][1];
    const url = new URL(job.templateData.verificationUrl);
    const rawToken = url.searchParams.get("token")!;
    const stored = prisma.emailVerificationToken.create.mock.calls[0][0].data;

    expect(rawToken).toHaveLength(64);
    expect(stored.token).toBe(
      crypto.createHash("sha256").update(rawToken).digest("hex"),
    );
    expect(stored.token).not.toBe(rawToken);
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("send-template işi doğru şablon, log ve redaksiyon bayrağıyla yazılır", async () => {
    const { service, emailQueue, notificationService } = makeService();

    await service.queueEmailVerification("user-1");

    const [jobName, payload] = emailQueue.add.mock.calls[0];
    expect(jobName).toBe("send-template");
    expect(payload).toMatchObject({
      to: "u@example.com",
      subject: "E-posta Adresinizi Doğrulayın",
      template: "email-verification",
      notificationLog: {
        userId: "user-1",
        type: "email_verification",
        title: "E-posta Doğrulama",
      },
      // Yük canlı token'lı linki taşıyor; EmailLog.metadata'ya yazılmamalı.
      redactTemplateData: true,
    });
    // Override geçilmez: worker'ın çıktısı senkron yolunkiyle aynı kalsın.
    expect(payload.overrideHtml).toBeUndefined();
    expect(payload.overrideSubject).toBeUndefined();
    // Kuyruklu yol ikinci bir mail göndermez.
    expect(notificationService.sendEmailVerification).not.toHaveBeenCalled();
  });

  it("zaten doğrulanmış hesapta kuyruğa hiç yazmaz", async () => {
    const { service, emailQueue, prisma } = makeService({
      ...baseUser,
      isEmailVerified: true,
    });

    await expect(
      service.queueEmailVerification("user-1"),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.auth.emailAlreadyVerified" },
    });
    expect(emailQueue.add).not.toHaveBeenCalled();
    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  it("olmayan kullanıcıda 404", async () => {
    const { service, emailQueue } = makeService(null);

    await expect(service.queueEmailVerification("yok")).rejects.toMatchObject({
      response: { i18nKey: "server.auth.userNotFound" },
    });
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it("tekil gönderim senkron kalır — kuyruğa yazmaz", async () => {
    const { service, emailQueue, notificationService } = makeService();

    await service.resendEmailVerification("user-1");

    expect(notificationService.sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).not.toHaveBeenCalled();
  });
});
