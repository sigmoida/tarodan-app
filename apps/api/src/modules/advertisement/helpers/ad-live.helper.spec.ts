import { adLiveWhere, isAdLive, type AdLiveFields } from "./ad-live.helper";

/**
 * Seçim (`GET /ads/active`) ve sayım (tık/gösterim) aynı yüklemi kullanır;
 * burada sabitlenen her satır iki yolu birden bağlar.
 */
describe("isAdLive", () => {
  const NOW = new Date("2026-10-09T12:00:00Z");
  const HOUR = 3600_000;
  const before = new Date(NOW.getTime() - HOUR);
  const after = new Date(NOW.getTime() + HOUR);

  const ad = (over: Partial<AdLiveFields> = {}): AdLiveFields => ({
    isActive: true,
    startDate: null,
    endDate: null,
    discount: null,
    ...over,
  });

  const campaign = (
    over: Partial<NonNullable<AdLiveFields["discount"]>> = {},
  ) => ({
    isActive: true,
    startDate: before,
    endDate: after,
    budgetStoppedAt: null,
    ...over,
  });

  it("açık ve tarihsiz reklam yayındadır", () => {
    expect(isAdLive(ad(), NOW)).toBe(true);
  });

  it("admin anahtarı kapalıysa yayında değildir", () => {
    expect(isAdLive(ad({ isActive: false }), NOW)).toBe(false);
  });

  it("başlangıcı gelecekteyse yayında değildir", () => {
    expect(isAdLive(ad({ startDate: after }), NOW)).toBe(false);
  });

  it("bitişi geçmişse yayında değildir", () => {
    expect(isAdLive(ad({ endDate: before }), NOW)).toBe(false);
  });

  it("pencere sınırları dahildir", () => {
    expect(isAdLive(ad({ startDate: NOW, endDate: NOW }), NOW)).toBe(true);
  });

  it("pencerenin içindeyse yayındadır", () => {
    expect(isAdLive(ad({ startDate: before, endDate: after }), NOW)).toBe(
      true,
    );
  });

  it("bağlı kampanya canlıysa yayındadır", () => {
    expect(isAdLive(ad({ discount: campaign() }), NOW)).toBe(true);
  });

  it.each([
    ["kampanya pasif", { isActive: false }],
    ["kampanya bütçesi durdu", { budgetStoppedAt: before }],
    ["kampanya bitti", { endDate: before }],
    ["kampanya henüz başlamadı", { startDate: after }],
  ])("%s → yayında değildir", (_d, over) => {
    expect(isAdLive(ad({ discount: campaign(over) }), NOW)).toBe(false);
  });
});

describe("adLiveWhere", () => {
  it("anahtarı ve pencerenin iki ucunu (null = sınırsız) süzer", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(adLiveWhere(now)).toEqual({
      isActive: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    });
  });
});
