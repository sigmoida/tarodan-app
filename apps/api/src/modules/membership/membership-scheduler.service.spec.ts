import { MembershipSchedulerService } from "./membership-scheduler.service";
import { NotificationType } from "../notification/dto";

/**
 * Hatırlatma cron'u: (a) iptal edilmiş ama dönemi süren üyeler de hatırlatma
 * almalı (erişimi bitecek kitle tam olarak onlar), (b) CTA gerçek bir rotaya
 * gitmeli (/membership/renew diye sayfa yok), (c) e-postanın yanında in-app+push
 * MEMBERSHIP_EXPIRING düşmeli, (d) aylık teklif e-postası yalnız GERÇEK üyelik
 * ayrıcalıklarını vaat etmeli.
 */
describe("MembershipSchedulerService", () => {
  const member = (userId: string, tierName: string) => ({
    autoRenew: false,
    currentPeriodEnd: new Date("2026-08-20T00:00:00.000Z"),
    user: { id: userId, email: `${userId}@ornek.com`, displayName: "Üye" },
    tier: { name: tierName, type: "premium" },
  });

  const makeService = () => {
    const prisma = {
      userMembership: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const scheduledQueue = { add: jest.fn() };
    const notifications = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
    };
    const service = new MembershipSchedulerService(
      prisma as any,
      emailQueue as any,
      scheduledQueue as any,
      {} as any,
      notifications as any,
    );
    return { service, prisma, emailQueue, notifications };
  };

  describe("runSendExpirationReminders", () => {
    it("cancelled üyeleri de kapsar (iptal = dönem sonuna kadar hak)", async () => {
      const { service, prisma } = makeService();

      await service.runSendExpirationReminders();

      expect(prisma.userMembership.findMany).toHaveBeenCalledTimes(2);
      for (const [args] of prisma.userMembership.findMany.mock.calls) {
        expect(args.where.status).toEqual({ in: ["active", "cancelled"] });
      }
    });

    it("e-posta CTA'sı var olan /membership rotasına gider ve MEMBERSHIP_EXPIRING düşer", async () => {
      const { service, prisma, emailQueue, notifications } = makeService();
      prisma.userMembership.findMany
        .mockResolvedValueOnce([member("user-7", "Premium Üyelik")])
        .mockResolvedValueOnce([member("user-1", "Temel Üyelik")]);

      await service.runSendExpirationReminders();

      expect(emailQueue.add).toHaveBeenCalledTimes(2);
      for (const [, payload] of emailQueue.add.mock.calls) {
        expect(payload.templateData.renewUrl).toMatch(/\/membership$/);
      }
      expect(notifications.createInAppNotification).toHaveBeenCalledWith(
        "user-7",
        NotificationType.MEMBERSHIP_EXPIRING,
        { tierName: "Premium Üyelik", daysLeft: 7 },
      );
      expect(notifications.createInAppNotification).toHaveBeenCalledWith(
        "user-1",
        NotificationType.MEMBERSHIP_EXPIRING,
        { tierName: "Temel Üyelik", daysLeft: 1 },
      );
    });

    it("bildirim hatası hatırlatma turunu durdurmaz", async () => {
      const { service, prisma, emailQueue, notifications } = makeService();
      prisma.userMembership.findMany
        .mockResolvedValueOnce([
          member("user-a", "Premium"),
          member("user-b", "Premium"),
        ])
        .mockResolvedValueOnce([]);
      notifications.createInAppNotification.mockRejectedValue(
        new Error("push down"),
      );

      await expect(service.runSendExpirationReminders()).resolves.toMatchObject(
        { sevenDayReminders: 2 },
      );
      expect(emailQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe("runSendMonthlyPremiumOffers", () => {
    it("yalnız gerçek üyelik ayrıcalıklarını vaat eder", async () => {
      const { service, prisma, emailQueue } = makeService();
      prisma.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          email: "user-1@ornek.com",
          displayName: "Üye",
          _count: { products: 2, buyerOrders: 1 },
        },
      ]);

      await service.runSendMonthlyPremiumOffers();

      const [, payload] = emailQueue.add.mock.calls[0];
      const benefits: string[] = payload.templateData.benefits;
      // Üründen kaldırılan özellikler vaat edilemez.
      expect(benefits).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/Reklamsız|Öne çıkan/)]),
      );
      expect(benefits).toEqual(
        expect.arrayContaining(["Takas yapabilme", "Koleksiyon oluşturma"]),
      );
    });
  });
});
