import { ConsentSource } from "@prisma/client";
import { NewsletterService } from "./newsletter.service";

/**
 * E-postadaki çıkış bağlantısı üyenin pazarlama iznini kapatır; bu bir izin
 * GERİ ÇEKMESİDİR ve tarihli onay kaydı olarak yazılır.
 */
describe("NewsletterService — çıkış pazarlama iznini geri çeker", () => {
  const makeService = (members: Array<{ id: string }>) => {
    const tx = { user: { updateMany: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      newsletterSubscriber: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sub-1",
          email: "u@example.com",
          unsubscribedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue(members) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const consents = { recordMarketingChange: jest.fn() };
    const service = new NewsletterService(prisma as never, consents as never);
    return { service, tx, consents };
  };

  it("izni açık üye için bayrağı kapatır ve geri çekme kaydı yazar", async () => {
    const { service, tx, consents } = makeService([{ id: "user-1" }]);

    await service.unsubscribeByToken("token-1");

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-1"] }, acceptsMarketingEmails: true },
      data: { acceptsMarketingEmails: false },
    });
    expect(consents.recordMarketingChange).toHaveBeenCalledWith(
      {
        userId: "user-1",
        granted: false,
        source: ConsentSource.newsletter_unsubscribe,
      },
      tx,
    );
  });

  it("üye değilse (misafir abone) ya da izni zaten kapalıysa kayıt yazmaz", async () => {
    const { service, tx, consents } = makeService([]);

    await service.unsubscribeByToken("token-1");

    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(consents.recordMarketingChange).not.toHaveBeenCalled();
  });
});
