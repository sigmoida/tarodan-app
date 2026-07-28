import { NotificationAccountService } from "./notification-account.service";

describe("NotificationAccountService.sendEmailVerification", () => {
  it("uses the legacy DB template key and sends a tokenized verification link", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: "new-user@example.com",
          displayName: "New User",
        }),
      },
      emailTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          subject: "E-posta Adresinizi Doğrulayın",
          bodyHtml:
            '<p>{{displayName}}</p><a href="{{verificationUrl}}">Doğrula</a>',
        }),
      },
    };
    const dispatch = {
      substituteTemplateVariables: jest.fn(
        (template: string, data: Record<string, string>) =>
          template.replace(/{{(\w+)}}/g, (_match, key) => data[key] ?? ""),
      ),
      logNotification: jest.fn().mockResolvedValue(undefined),
    };
    const sendGridProvider = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendEmail: jest.fn().mockResolvedValue({
        success: true,
        messageId: "message-1",
      }),
    };
    const smtpProvider = {
      isConfigured: jest.fn().mockReturnValue(false),
      sendEmail: jest.fn(),
    };
    const configService = {
      get: jest.fn().mockReturnValue("https://tarodan.com"),
    };

    const service = new NotificationAccountService(
      dispatch as never,
      prisma as never,
      configService as never,
      sendGridProvider as never,
      smtpProvider as never,
    );

    await expect(
      service.sendEmailVerification("user-1", "raw-verification-token"),
    ).resolves.toEqual(
      expect.objectContaining({ success: true, messageId: "message-1" }),
    );

    expect(prisma.emailTemplate.findFirst).toHaveBeenCalledWith({
      where: {
        key: { in: ["email-verification", "email_verification"] },
      },
    });
    expect(sendGridProvider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new-user@example.com",
        subject: "E-posta Adresinizi Doğrulayın",
        html: expect.stringContaining(
          "https://tarodan.com/verify-email?token=raw-verification-token",
        ),
      }),
    );
    expect(dispatch.logNotification).toHaveBeenCalledWith(
      "user-1",
      "email",
      "email_verification",
      "E-posta Doğrulama",
      "",
      true,
    );
  });
});

describe("NotificationAccountService.sendGuestCheckoutVerificationCode", () => {
  it("does not report success when the delivery provider rejects the OTP email", async () => {
    const dispatch = {
      sendTemplateEmailToAddress: jest.fn().mockResolvedValue({
        success: false,
        error: "provider unavailable",
      }),
    };
    const service = new NotificationAccountService(
      dispatch as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.sendGuestCheckoutVerificationCode(
        "guest@example.com",
        "123456",
        600,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
      }),
    );
  });
});
