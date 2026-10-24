import { ConsentSource } from "@prisma/client";
import { UserProfileService } from "./user-profile.service";

/**
 * Profildeki pazarlama düğmesi: izin VERİLDİĞİ ve GERİ ÇEKİLDİĞİ an tarihli
 * onay kaydıdır. Ayrıca bülten listesi (gönderimlerin tek alıcı listesi)
 * bayrakla hizalanır — aksi halde "geri çekildi" kaydına rağmen bülten giderdi.
 */
describe("UserProfileService.updateNotificationSettings — pazarlama izni", () => {
  const makeService = (acceptsMarketingEmails: boolean) => {
    const tx = { user: { update: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockImplementation(({ select }: any) =>
            Promise.resolve(
              select?.acceptsMarketingEmails
                ? { email: "u@example.com", acceptsMarketingEmails }
                : { notificationSettings: null },
            ),
          ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const consents = { recordMarketingChange: jest.fn() };
    const newsletter = { syncUserConsent: jest.fn() };
    const service = new UserProfileService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      consents as never,
      newsletter as never,
      {} as never, // search
      {} as never, // cache
      {} as never, // notifications
      {} as never, // sellerTrust
    );
    return { service, tx, consents, newsletter };
  };

  it("izni kapatmak tarihli bir geri çekme kaydı yazar ve bülteni kapatır", async () => {
    const { service, tx, consents, newsletter } = makeService(true);

    await service.updateNotificationSettings("u1", { marketingEmails: false });

    expect(tx.user.update.mock.calls[0][0].data.acceptsMarketingEmails).toBe(
      false,
    );
    expect(consents.recordMarketingChange).toHaveBeenCalledWith(
      {
        userId: "u1",
        granted: false,
        source: ConsentSource.account_settings,
      },
      tx,
    );
    expect(newsletter.syncUserConsent).toHaveBeenCalledWith(
      "u@example.com",
      false,
    );
  });

  it("izni açmak tarihli bir verme kaydı yazar", async () => {
    const { service, consents, newsletter } = makeService(false);

    await service.updateNotificationSettings("u1", { marketingEmails: true });

    expect(consents.recordMarketingChange).toHaveBeenCalledWith(
      expect.objectContaining({ granted: true }),
      expect.anything(),
    );
    expect(newsletter.syncUserConsent).toHaveBeenCalledWith(
      "u@example.com",
      true,
    );
  });

  it("JSON'a pazarlama anahtarı yazılmaz; izin yalnız kolondadır", async () => {
    const { service, tx } = makeService(false);

    await service.updateNotificationSettings("u1", {
      marketingEmails: true,
      orderUpdates: false,
    });

    const data = tx.user.update.mock.calls[0][0].data;
    expect(data.acceptsMarketingEmails).toBe(true);
    expect(data.notificationSettings).not.toHaveProperty("marketingEmails");
    expect(data.notificationSettings).toMatchObject({ orderUpdates: false });
  });

  it("pazarlama dışı değişiklikte kolon yazılmaz", async () => {
    const { service, tx } = makeService(true);

    await service.updateNotificationSettings("u1", { orderUpdates: false });

    expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty(
      "acceptsMarketingEmails",
    );
  });

  it("değer değişmediyse kayıt yazmaz, listeye dokunmaz", async () => {
    const { service, consents, newsletter } = makeService(true);

    await service.updateNotificationSettings("u1", { marketingEmails: true });

    expect(consents.recordMarketingChange).not.toHaveBeenCalled();
    expect(newsletter.syncUserConsent).not.toHaveBeenCalled();
  });

  it("pazarlama dışı bir tercih değişimi onay kaydı üretmez", async () => {
    const { service, consents } = makeService(true);

    await service.updateNotificationSettings("u1", { orderUpdates: false });

    expect(consents.recordMarketingChange).not.toHaveBeenCalled();
  });
});

/**
 * S1 — Apple 4.5.4: kapatma yolu gerçeği göstermeli. Pazarlama düğmesi izin
 * KOLONUNDAN okunur; kayıtta izin veren kullanıcı (JSON'da anahtar yok)
 * düğmeyi kapalı görüp pazarlama iletisi almaya devam etmemeli.
 */
describe("UserProfileService.getNotificationSettings — pazarlama düğmesi", () => {
  const makeService = (row: Record<string, unknown> | null) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(row) },
    };
    const service = new UserProfileService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never, // search
      {} as never, // cache
      {} as never, // notifications
      {} as never, // sellerTrust
    );
    return { service, prisma };
  };

  it("kayıtta izin verilmiş, JSON boş → düğme AÇIK görünür", async () => {
    const { service } = makeService({
      notificationSettings: null,
      acceptsMarketingEmails: true,
    });

    const settings = await service.getNotificationSettings("u1");

    expect(settings.marketingEmails).toBe(true);
  });

  it("JSON açık ama izin geri çekilmiş (bülten çıkışı) → düğme KAPALI görünür", async () => {
    const { service } = makeService({
      notificationSettings: { marketingEmails: true, orderUpdates: false },
      acceptsMarketingEmails: false,
    });

    const settings = await service.getNotificationSettings("u1");

    expect(settings.marketingEmails).toBe(false);
    // Diğer tercihler JSON'dan gelmeye devam eder.
    expect(settings.orderUpdates).toBe(false);
  });

  it("izin kolonu sorguda seçilir", async () => {
    const { service, prisma } = makeService({
      notificationSettings: null,
      acceptsMarketingEmails: false,
    });

    await service.getNotificationSettings("u1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { notificationSettings: true, acceptsMarketingEmails: true },
    });
  });
});
