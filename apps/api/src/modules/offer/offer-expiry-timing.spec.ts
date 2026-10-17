import { OfferService } from "./offer.service";

/**
 * Teklif (ve karşı teklif) geçerliliği Süreler ve Kurallar'dan
 * (`offerExpiryHours`): seed'in `offer_expiry_hours` satırı artık GERÇEKTEN
 * okunur (eskiden ölü ayardı, kod env'i okuyordu); env OFFER_EXPIRY_HOURS
 * yalnız geri düşüş. create / counter / buyerCounter aynı yardımcıyı çağırır.
 */
describe("OfferService — teklif geçerlilik süresi", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  const expiresAtWith = (
    settings: Record<string, string>,
    env: Record<string, string>,
  ): Promise<Date> => {
    const prisma = {
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey] }
              : null,
        ),
      },
    };
    const service = new OfferService(
      prisma as any,
      {} as any,
      { get: (key: string) => env[key] } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      {} as any,
      {} as any,
    );
    return (service as any).offerExpiresAt();
  };

  it("admin değeri ve env yokken bugünkü gibi 24 saat", async () => {
    await expect(expiresAtWith({}, {})).resolves.toEqual(
      new Date(NOW.getTime() + 24 * HOUR),
    );
  });

  it("env geri düşüşünü (OFFER_EXPIRY_HOURS) okur", async () => {
    await expect(
      expiresAtWith({}, { OFFER_EXPIRY_HOURS: "48" }),
    ).resolves.toEqual(new Date(NOW.getTime() + 48 * HOUR));
  });

  it("offer_expiry_hours ayarı env'i ezer", async () => {
    await expect(
      expiresAtWith({ offer_expiry_hours: "12" }, { OFFER_EXPIRY_HOURS: "48" }),
    ).resolves.toEqual(new Date(NOW.getTime() + 12 * HOUR));
  });
});
