import { Logger } from "@nestjs/common";
import { NotificationAccountService } from "./notification-account.service";

describe("NotificationAccountService.sendPasswordResetEmail", () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  const build = (smtpConfigured: boolean) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: "member@example.com",
          displayName: "Member",
        }),
      },
      emailTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const dispatch = {
      logNotification: jest.fn().mockResolvedValue(undefined),
      sendTemplateEmailToAddress: jest.fn().mockResolvedValue(undefined),
    };
    const smtpProvider = {
      isConfigured: jest.fn().mockReturnValue(smtpConfigured),
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new NotificationAccountService(
      dispatch as never,
      prisma as never,
      {} as never,
      smtpProvider as never,
    );
    return { service, smtpProvider, dispatch };
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("links to the canonical host in production when FRONTEND_URL is unset", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.FRONTEND_URL;
    const { service, smtpProvider } = build(true);

    await service.sendPasswordResetEmail("user-1", "tok");

    expect(smtpProvider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          "https://tarodan.com.tr/reset-password?token=tok",
        ),
        template: "password-reset",
        userId: "user-1",
      }),
    );
  });

  it("links to the local web server outside production when FRONTEND_URL is unset", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.FRONTEND_URL;
    const { service, smtpProvider } = build(true);

    await service.sendPasswordResetEmail("user-1", "tok");

    expect(smtpProvider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          "http://localhost:3000/reset-password?token=tok",
        ),
      }),
    );
  });

  it("builds the welcome link with the same host rule", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.FRONTEND_URL;
    const { service, dispatch } = build(true);

    await service.sendWelcomeEmail("user-1");

    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
      "member@example.com",
      "welcome",
      expect.objectContaining({ verifyUrl: "http://localhost:3000/listings" }),
    );
  });

  it("links to FRONTEND_URL when it is set", async () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://staging.tarodan.com.tr";
    const { service, smtpProvider } = build(true);

    await service.sendPasswordResetEmail("user-1", "tok");

    expect(smtpProvider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          "https://staging.tarodan.com.tr/reset-password?token=tok",
        ),
      }),
    );
  });

  it("reports a dropped reset at error level (Sentry) without throwing or logging the address", async () => {
    const { service, smtpProvider } = build(false);

    await expect(
      service.sendPasswordResetEmail("user-1", "tok"),
    ).resolves.toEqual(expect.objectContaining({ success: false }));

    expect(smtpProvider.sendEmail).not.toHaveBeenCalled();
    const errorSpy = Logger.prototype.error as jest.Mock;
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("userId=user-1");
    const logged = JSON.stringify([
      ...errorSpy.mock.calls,
      ...(Logger.prototype.log as jest.Mock).mock.calls,
      ...(Logger.prototype.warn as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toContain("member@example.com");
  });

  it("scrubs the recipient address from a provider rejection before logging it", async () => {
    const { service, smtpProvider } = build(true);
    smtpProvider.sendEmail.mockResolvedValue({
      success: false,
      error: "550 5.1.1 <member@example.com>: Recipient address rejected",
    });

    await service.sendPasswordResetEmail("user-1", "tok");

    const errorSpy = Logger.prototype.error as jest.Mock;
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("userId=user-1");
    expect(errorSpy.mock.calls[0][0]).toContain("Recipient address rejected");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "member@example.com",
    );
  });
});
