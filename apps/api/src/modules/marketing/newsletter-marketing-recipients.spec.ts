import { NewsletterService } from "./newsletter.service";

/**
 * Admin toplu pazarlama e-postasının alıcı kümesi: izni açık + banlı olmayan +
 * abonelikten çıkmamış üyeler; her biri için çalışan bir çıkış token'ı.
 */
describe("NewsletterService.resolveMarketingUnsubscribeTokens", () => {
  const makeService = (opts: {
    users: Array<{ id: string; email: string }>;
    subscribers: Array<{
      email: string;
      unsubscribeToken: string;
      unsubscribedAt: Date | null;
    }>;
  }) => {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue(opts.users) },
      newsletterSubscriber: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue(opts.subscribers),
      },
    };
    const service = new NewsletterService(prisma as never, {} as never);
    return { service, prisma };
  };

  it("yalnız izinli, banlı olmayan üyeleri sorgular", async () => {
    const { service, prisma } = makeService({ users: [], subscribers: [] });

    const tokens = await service.resolveMarketingUnsubscribeTokens(["u1"]);

    expect(tokens.size).toBe(0);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["u1"] },
          acceptsMarketingEmails: true,
          isBanned: false,
        },
      }),
    );
    expect(prisma.newsletterSubscriber.createMany).not.toHaveBeenCalled();
  });

  it("userId → token haritası döner; abone satırı olmayan üye için satır açılır", async () => {
    const { service, prisma } = makeService({
      users: [
        { id: "u1", email: "Var@Example.com" },
        { id: "u2", email: "yeni@example.com" },
      ],
      subscribers: [
        {
          email: "var@example.com",
          unsubscribeToken: "tok-1",
          unsubscribedAt: null,
        },
        {
          email: "yeni@example.com",
          unsubscribeToken: "tok-2",
          unsubscribedAt: null,
        },
      ],
    });

    const tokens = await service.resolveMarketingUnsubscribeTokens([
      "u1",
      "u2",
    ]);

    expect(Object.fromEntries(tokens)).toEqual({ u1: "tok-1", u2: "tok-2" });
    expect(prisma.newsletterSubscriber.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it("abonelikten çıkmış üye atlanır (çıkış profil bayrağından önceliklidir)", async () => {
    const { service } = makeService({
      users: [
        { id: "u1", email: "cikmis@example.com" },
        { id: "u2", email: "aktif@example.com" },
      ],
      subscribers: [
        {
          email: "cikmis@example.com",
          unsubscribeToken: "tok-1",
          unsubscribedAt: new Date(),
        },
        {
          email: "aktif@example.com",
          unsubscribeToken: "tok-2",
          unsubscribedAt: null,
        },
      ],
    });

    const tokens = await service.resolveMarketingUnsubscribeTokens([
      "u1",
      "u2",
    ]);

    expect([...tokens.keys()]).toEqual(["u2"]);
  });
});
