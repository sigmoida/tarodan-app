import { ProductSchedulerService } from "./product-scheduler.service";

/**
 * İlan ömrü (`listingTtlDays`) ve uyarı günü (`listingExpiryWarningDays`)
 * Süreler ve Kurallar'dan her cron turunun başında okunur. Bitiş ilana
 * damgalanmaz: tur "şimdi − N gün" kesimini kullanır.
 */
describe("ProductSchedulerService — ilan ömrü süreleri", () => {
  const NOW = new Date("2026-10-05T04:00:00.000Z");
  const ORIGINAL = process.env.LISTING_TTL_DAYS;

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  beforeEach(() => {
    delete process.env.LISTING_TTL_DAYS;
  });
  afterAll(() => {
    jest.useRealTimers();
    if (ORIGINAL === undefined) delete process.env.LISTING_TTL_DAYS;
    else process.env.LISTING_TTL_DAYS = ORIGINAL;
  });

  const makeService = (settings: Record<string, string> = {}) => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey] }
              : null,
        ),
      },
    };
    const service = new ProductSchedulerService(
      prisma as any,
      { sendTemplateEmailToUser: jest.fn() } as any,
      {} as any,
    );
    return { service, prisma };
  };

  /** Servisle aynı takvim aritmetiği: NOW − n gün (setDate). */
  const daysBefore = (days: number) => {
    const date = new Date(NOW);
    date.setDate(date.getDate() - days);
    return date;
  };

  const expiryCutoff = (prisma: { product: { updateMany: jest.Mock } }) =>
    prisma.product.updateMany.mock.calls[0][0].where.OR[0].publishedAt.lt;

  const warningBandEnd = (prisma: { product: { findMany: jest.Mock } }) =>
    prisma.product.findMany.mock.calls[0][0].where.OR[0].publishedAt.lt;

  it("admin değeri ve env yokken bugünkü gibi 60 gün", async () => {
    const { service, prisma } = makeService();
    await service.runExpireOldListings();
    expect(expiryCutoff(prisma)).toEqual(daysBefore(60));
  });

  it("env geri düşüşünü (LISTING_TTL_DAYS) okur", async () => {
    process.env.LISTING_TTL_DAYS = "90";
    const { service, prisma } = makeService();
    await service.runExpireOldListings();
    expect(expiryCutoff(prisma)).toEqual(daysBefore(90));
  });

  it("admin değeri env'i ezer", async () => {
    process.env.LISTING_TTL_DAYS = "90";
    const { service, prisma } = makeService({ listing_ttl_days: "30" });
    await service.runExpireOldListings();
    expect(expiryCutoff(prisma)).toEqual(daysBefore(30));
  });

  it("uyarı bandı bugünkü gibi ömür − 7 günde biter (60 − 7 = 53)", async () => {
    const { service, prisma } = makeService();
    await service.runSendExpirationWarnings();
    expect(warningBandEnd(prisma)).toEqual(daysBefore(53));
  });

  it("uyarı bandı admin değerlerini izler (ömür 30, uyarı 3 → 27 gün)", async () => {
    const { service, prisma } = makeService({
      listing_ttl_days: "30",
      listing_expiry_warning_days: "3",
    });
    await service.runSendExpirationWarnings();
    expect(warningBandEnd(prisma)).toEqual(daysBefore(27));
  });
});
