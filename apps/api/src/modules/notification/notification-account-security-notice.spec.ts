import { Logger } from "@nestjs/common";
import { NotificationAccountService } from "./notification-account.service";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import {
  ACCOUNT_SECURITY_NOTICE_EVENTS,
  ACCOUNT_SECURITY_NOTICE_TEMPLATE,
  buildAccountSecurityNoticeData,
} from "../../common/helpers/account-security-notice-mail";

const EMAIL = "member@example.com";

describe("account security notice", () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  const build = (queueError?: Error) => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: EMAIL, displayName: "Ayse" }),
      },
    };
    const queue = {
      add: queueError
        ? jest.fn().mockRejectedValue(queueError)
        : jest.fn().mockResolvedValue(undefined),
    };
    const service = new NotificationAccountService(
      {} as never,
      prisma as never,
      {} as never,
      {} as never,
      queue as never,
    );
    return { service, prisma, queue };
  };

  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    process.env.FRONTEND_URL = "https://tarodan.com.tr";
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    errorLog = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it("queues the provider-linked notice with the provider, links and no EmailLog metadata", async () => {
    const { service, queue } = build();

    await service.sendAccountSecurityNotice("user-1", "providerLinked", {
      provider: "google",
      at: new Date("2026-10-19T10:00:00Z"),
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, job] = queue.add.mock.calls[0];
    expect(name).toBe("send-template");
    expect(job).toMatchObject({
      to: EMAIL,
      template: ACCOUNT_SECURITY_NOTICE_TEMPLATE,
      subject: "Hesabınıza Google ile giriş eklendi",
      redactTemplateData: true,
      templateData: {
        userId: "user-1",
        name: "Ayse",
        event: "providerLinked",
        resetUrl: "https://tarodan.com.tr/forgot-password",
        supportUrl: "https://tarodan.com.tr/support",
      },
    });
    expect(job.templateData.message).toContain("19.10.2026");
    expect(job.templateData.message).toContain("Google");
    // The recipient address only travels as `to`, never in the payload.
    expect(JSON.stringify(job.templateData)).not.toContain(EMAIL);
  });

  it("renders every event with its own copy and the reset and support links", () => {
    const subjects = new Set<string>();
    for (const event of ACCOUNT_SECURITY_NOTICE_EVENTS) {
      const data = buildAccountSecurityNoticeData({
        event,
        name: "Ayse",
        provider: event === "passwordSet" ? undefined : "apple",
      });
      const mail = renderManagedEmailTemplate(
        ACCOUNT_SECURITY_NOTICE_TEMPLATE,
        { ...data, to: EMAIL },
        null,
        "https://tarodan.com.tr",
      );
      subjects.add(mail.subject);
      expect(mail.html).toContain(data.message);
      expect(mail.html).toContain("https://tarodan.com.tr/forgot-password");
      expect(mail.html).toContain("https://tarodan.com.tr/support");
      expect(mail.html).not.toMatch(/\{\{|\{provider\}|\{date\}/);
    }
    expect(subjects.size).toBe(ACCOUNT_SECURITY_NOTICE_EVENTS.length);
  });

  it("swallows a queue failure and logs the user id without the address", async () => {
    const { service } = build(new Error(`redis down for ${EMAIL}`));

    await expect(
      service.sendAccountSecurityNotice("user-1", "passwordSet"),
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = String(errorLog.mock.calls[0][0]);
    expect(line).toContain("userId=user-1");
    expect(line).not.toContain(EMAIL);
  });

  it("swallows a lookup failure and sends nothing for a missing user", async () => {
    const { service, prisma, queue } = build();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await service.sendAccountSecurityNotice("gone", "passwordSet");
    prisma.user.findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(
      service.sendAccountSecurityNotice("user-1", "passwordSet"),
    ).resolves.toBeUndefined();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
