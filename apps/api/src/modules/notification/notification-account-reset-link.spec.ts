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
    return { service, smtpProvider };
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
    process.env.NODE_ENV = originalNodeEnv;
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
      }),
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
});
