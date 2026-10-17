import {
  heroSlideLiveWhere,
  isHeroSlideLive,
  peakConcurrentWindows,
  type HeroWindow,
} from "./hero-live.helper";

const NOW = new Date("2026-10-12T12:00:00Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000);

describe("isHeroSlideLive", () => {
  const slide = (
    over: Partial<Parameters<typeof isHeroSlideLive>[0]> = {},
  ) => ({
    isActive: true,
    startDate: null,
    endDate: null,
    ...over,
  });

  it.each([
    ["açık, pencere sınırsız", slide(), true],
    [
      "açık, pencerenin içinde",
      slide({ startDate: day(-1), endDate: day(1) }),
      true,
    ],
    ["bitiş anında (dahil)", slide({ endDate: NOW }), true],
    ["kapalı", slide({ isActive: false }), false],
    ["henüz başlamadı", slide({ startDate: day(1) }), false],
    ["bitti", slide({ endDate: day(-1) }), false],
  ])("%s → %s", (_d, value, expected) => {
    expect(isHeroSlideLive(value, NOW)).toBe(expected);
  });

  it("veritabanı süzmesi anahtar + pencere iki ucudur", () => {
    expect(heroSlideLiveWhere(NOW)).toEqual({
      isActive: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: NOW } }] },
        { OR: [{ endDate: null }, { endDate: { gte: NOW } }] },
      ],
    });
  });
});

describe("peakConcurrentWindows", () => {
  const open: HeroWindow = { startDate: null, endDate: null };

  it("boş liste 0", () => {
    expect(peakConcurrentWindows([], NOW)).toBe(0);
  });

  it("sınırsız pencereler hepsi birden açıktır", () => {
    expect(peakConcurrentWindows([open, open, open], NOW)).toBe(3);
  });

  it("bitmiş pencere sayılmaz", () => {
    expect(
      peakConcurrentWindows([open, { startDate: null, endDate: day(-1) }], NOW),
    ).toBe(1);
  });

  it("art arda (kesişmeyen) pencereler aynı anda sayılmaz", () => {
    expect(
      peakConcurrentWindows(
        [
          { startDate: null, endDate: day(5) },
          { startDate: day(6), endDate: day(10) },
          { startDate: day(11), endDate: null },
        ],
        NOW,
      ),
    ).toBe(1);
  });

  it("sınırlar dahil: biri bittiği anda öbürü başlıyorsa o an ikisi de açık", () => {
    expect(
      peakConcurrentWindows(
        [
          { startDate: null, endDate: day(5) },
          { startDate: day(5), endDate: null },
        ],
        NOW,
      ),
    ).toBe(2);
  });

  it("ileri tarihli pencere, o gün açık olanlarla birlikte sayılır", () => {
    expect(
      peakConcurrentWindows(
        [open, open, { startDate: day(3), endDate: day(4) }],
        NOW,
      ),
    ).toBe(3);
  });

  it("geçmişte başlamış pencere şimdi başlamış sayılır", () => {
    expect(
      peakConcurrentWindows(
        [
          { startDate: day(-30), endDate: day(2) },
          { startDate: day(-10), endDate: null },
        ],
        NOW,
      ),
    ).toBe(2);
  });
});
