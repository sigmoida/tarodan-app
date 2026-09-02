import { EmailWorker, type EmailJobData } from "./email.worker";

/**
 * Kuyruktan giden mail, senkron gönderimle aynı denetim izini bırakmalı:
 * mantıksal gönderim başına BİR notification_log satırı. Bull 3 kez denediği
 * için başarısızlıkta satır yalnız son denemede yazılır.
 *
 * Ayrıca aktivasyon yükü canlı token'lı link taşıyor; EmailLog.metadata'ya
 * yazılırsa token kalıcı olarak düz metin saklanır.
 */
describe("EmailWorker.handleSend — notificationLog / redactTemplateData", () => {
  const makeWorker = (sendResult: { success: boolean; error?: string }) => {
    const smtp = {
      defaultFrom: "no-reply@tarodan.com.tr",
      sendEmail: jest.fn().mockResolvedValue(sendResult),
    };
    const dispatch = {
      logNotification: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new EmailWorker(
      { get: jest.fn() } as any,
      {} as any,
      smtp as any,
      dispatch as any,
    );
    return { worker, smtp, dispatch };
  };

  const job = (
    data: Partial<EmailJobData>,
    attemptsMade = 0,
    attempts = 3,
  ): any => ({
    id: "job-1",
    attemptsMade,
    opts: { attempts },
    data: {
      to: "u@example.com",
      subject: "Konu",
      html: "<p>merhaba</p>",
      ...data,
    },
  });

  const log = {
    userId: "user-1",
    type: "email_verification",
    title: "E-posta Doğrulama",
  };

  it("başarılı gönderimde tek satır yazar", async () => {
    const { worker, dispatch } = makeWorker({ success: true });

    await worker.handleSend(job({ notificationLog: log }));

    expect(dispatch.logNotification).toHaveBeenCalledTimes(1);
    expect(dispatch.logNotification).toHaveBeenCalledWith(
      "user-1",
      "email",
      "email_verification",
      "E-posta Doğrulama",
      "",
      true,
    );
  });

  it("alan yoksa hiç yazmaz — mevcut sipariş mailleri etkilenmez", async () => {
    const { worker, dispatch } = makeWorker({ success: true });

    await worker.handleSend(job({}));

    expect(dispatch.logNotification).not.toHaveBeenCalled();
  });

  it("son deneme değilse başarısızlıkta yazmaz, hatayı yeniden fırlatır", async () => {
    const { worker, dispatch } = makeWorker({ success: false, error: "smtp" });

    await expect(
      worker.handleSend(job({ notificationLog: log }, 0, 3)),
    ).rejects.toThrow("smtp");
    expect(dispatch.logNotification).not.toHaveBeenCalled();
  });

  it("son denemede başarısızlığı bir kez yazar", async () => {
    const { worker, dispatch } = makeWorker({ success: false, error: "smtp" });

    await expect(
      worker.handleSend(job({ notificationLog: log }, 2, 3)),
    ).rejects.toThrow("smtp");
    expect(dispatch.logNotification).toHaveBeenCalledTimes(1);
    expect(dispatch.logNotification).toHaveBeenCalledWith(
      "user-1",
      "email",
      "email_verification",
      "E-posta Doğrulama",
      "",
      false,
    );
  });

  it("redactTemplateData ile token metadata'ya yazılmaz, userId damgası kalır", async () => {
    const { worker, smtp } = makeWorker({ success: true });

    await worker.handleSend(
      job({
        templateData: {
          userId: "user-1",
          verificationUrl: "https://x/verify-email?token=CANLI",
        },
        redactTemplateData: true,
      }),
    );

    const args = smtp.sendEmail.mock.calls[0][0];
    expect(args.metadata).toBeUndefined();
    expect(args.userId).toBe("user-1");
  });

  it("bayrak yokken metadata eskisi gibi yazılır", async () => {
    const { worker, smtp } = makeWorker({ success: true });

    await worker.handleSend(job({ templateData: { orderNumber: "ORD-1" } }));

    expect(smtp.sendEmail.mock.calls[0][0].metadata).toEqual({
      orderNumber: "ORD-1",
    });
  });
});
