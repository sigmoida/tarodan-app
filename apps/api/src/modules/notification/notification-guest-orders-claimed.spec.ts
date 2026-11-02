import { NotificationAccountService } from "./notification-account.service";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import { mailAreaOfTemplate } from "../../common/email/email-template-registry";
import {
  buildGuestOrdersClaimedMailData,
  GUEST_ORDERS_CLAIMED_TEMPLATE,
} from "../../common/helpers/guest-orders-claimed-mail";

// The "guest orders added to your account" mail (guest claim plan,
// 2026-11-02, security follow-up). Synthetic data only.
const EMAIL = "member@example.test";

describe("guest orders claimed notice", () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  const build = (
    user: Record<string, unknown> | null = {
      email: EMAIL,
      preferredLanguage: "tr",
    },
    queueError?: Error,
  ) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
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

  beforeEach(() => {
    process.env.FRONTEND_URL = "https://tarodan.com.tr";
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it("queues one transactional account mail with the count and the reset link only", async () => {
    const { service, queue } = build();

    await service.sendGuestOrdersClaimedNotice("user-1", 2);

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, job] = queue.add.mock.calls[0];
    expect(name).toBe("send-template");
    expect(job).toMatchObject({
      to: EMAIL,
      template: GUEST_ORDERS_CLAIMED_TEMPLATE,
      subject: "Misafir siparişleriniz hesabınıza eklendi",
      redactTemplateData: true,
      templateData: {
        userId: "user-1",
        resetUrl: "https://tarodan.com.tr/forgot-password",
      },
    });
    expect(job.templateData.message).toContain("2 sipariş");
    // The address travels only as `to`; no order number, name or address.
    expect(JSON.stringify(job.templateData)).not.toContain(EMAIL);
    expect(mailAreaOfTemplate(GUEST_ORDERS_CLAIMED_TEMPLATE)).toBe("account");
  });

  it("writes in the recipient's language and falls back to Turkish", async () => {
    const en = build({ email: EMAIL, preferredLanguage: "en" });
    await en.service.sendGuestOrdersClaimedNotice("user-1", 1);
    const enJob = en.queue.add.mock.calls[0][1];
    expect(enJob.subject).toBe("Your guest orders were added to your account");
    expect(enJob.templateData.message).toContain(
      "1 order you placed as a guest",
    );
    expect(enJob.templateData.warning).toContain(
      "If you did not create this account, reset your password",
    );

    const unknown = build({ email: EMAIL, preferredLanguage: "xx" });
    await unknown.service.sendGuestOrdersClaimedNotice("user-1", 3);
    expect(unknown.queue.add.mock.calls[0][1].subject).toBe(
      "Misafir siparişleriniz hesabınıza eklendi",
    );
  });

  it("sends nothing for a missing user", async () => {
    const { service, queue } = build(null);

    await service.sendGuestOrdersClaimedNotice("missing", 1);

    expect(queue.add).not.toHaveBeenCalled();
  });

  it("throws when the mail cannot be queued, so the caller decides", async () => {
    const { service } = build(undefined, new Error("redis down"));

    await expect(
      service.sendGuestOrdersClaimedNotice("user-1", 1),
    ).rejects.toThrow("redis down");
  });

  it.each(["tr", "en"] as const)(
    "renders every %s line from the catalog, with the reset button",
    (locale) => {
      const data = buildGuestOrdersClaimedMailData(locale, 2);
      const mail = renderManagedEmailTemplate(
        GUEST_ORDERS_CLAIMED_TEMPLATE,
        { ...data, to: EMAIL },
        null,
        "https://tarodan.com.tr",
      );

      expect(mail.subject).toBe(data.subject);
      for (const line of [
        data.title,
        data.greeting,
        data.message,
        data.warning,
        data.resetLabel,
        data.help,
      ]) {
        expect(line.length).toBeGreaterThan(0);
        expect(line).not.toContain("server.order");
        expect(mail.html).toContain(line);
      }
      expect(mail.html).toContain("https://tarodan.com.tr/forgot-password");
      expect(mail.html).not.toMatch(/\{\{|\{count/);
    },
  );
});
