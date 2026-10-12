import {
  AD_HOTSPOT_MAX,
  adHotspotsOverlap,
  validateAdHotspots,
  type AdHotspotInput,
} from "@tarodan/types";

const spot = (
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<AdHotspotInput> = {},
): AdHotspotInput => ({
  x,
  y,
  width,
  height,
  label: "Alan",
  linkUrl: "/kampanya",
  ...extra,
});

describe("ad hotspot rules (@tarodan/types)", () => {
  it("boş liste geçerlidir", () => {
    expect(validateAdHotspots([])).toEqual([]);
  });

  it("kenar kenara iki alan çakışık sayılmaz", () => {
    const left = spot(0, 0, 0.5, 1);
    const right = spot(0.5, 0, 0.5, 1);
    expect(adHotspotsOverlap(left, right)).toBe(false);
    expect(validateAdHotspots([left, right])).toEqual([]);
  });

  it("kesişen alanlar reddedilir", () => {
    expect(
      validateAdHotspots([spot(0, 0, 0.5, 0.5), spot(0.4, 0.4, 0.3, 0.3)]),
    ).toEqual([{ code: "overlap", index: 1, otherIndex: 0 }]);
  });

  it("biri ötekini içine alan alanlar da çakışıktır", () => {
    expect(adHotspotsOverlap(spot(0, 0, 1, 1), spot(0.2, 0.2, 0.1, 0.1))).toBe(
      true,
    );
  });

  it("görsel dışına taşan alan reddedilir", () => {
    expect(validateAdHotspots([spot(0.8, 0, 0.3, 0.5)])).toEqual([
      { code: "outOfBounds", index: 0 },
    ]);
    expect(validateAdHotspots([spot(-0.1, 0, 0.3, 0.5)])).toEqual([
      { code: "outOfBounds", index: 0 },
    ]);
    expect(validateAdHotspots([spot(Number.NaN, 0, 0.3, 0.5)])).toEqual([
      { code: "outOfBounds", index: 0 },
    ]);
  });

  it("çok küçük alan reddedilir", () => {
    expect(validateAdHotspots([spot(0, 0, 0.02, 0.5)])).toEqual([
      { code: "tooSmall", index: 0 },
    ]);
  });

  it("ad ve bağlantı zorunludur, ad uzunluğu sınırlıdır", () => {
    expect(
      validateAdHotspots([
        spot(0, 0, 0.5, 0.5, { label: "  ", linkUrl: "" }),
        spot(0.5, 0.5, 0.5, 0.5, { label: "x".repeat(81) }),
      ]),
    ).toEqual([
      { code: "labelRequired", index: 0 },
      { code: "linkRequired", index: 0 },
      { code: "labelTooLong", index: 1 },
    ]);
  });

  it("en çok alan sayısı aşılırsa reddedilir", () => {
    const many = Array.from({ length: AD_HOTSPOT_MAX + 1 }, (_, i) =>
      spot(i * 0.05, 0, 0.05, 0.5),
    );
    expect(validateAdHotspots(many)).toEqual([{ code: "tooMany" }]);
  });
});
