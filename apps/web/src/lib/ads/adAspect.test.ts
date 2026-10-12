/** @format */

import { describe, expect, it } from "vitest";
import { FALLBACK_AD_RATIO, adAspectRatio, naturalRatioOf } from "./adAspect";

describe("adAspectRatio", () => {
  it("afişin kendi ölçüsünü kullanır", () => {
    expect(adAspectRatio({ width: 728, height: 90 }, "header")).toBeCloseTo(
      728 / 90,
    );
  });

  it("ölçü yoksa ya da geçersizse konum varsayılanına düşer", () => {
    expect(adAspectRatio({ width: null, height: null }, "popup")).toBe(
      FALLBACK_AD_RATIO.popup,
    );
    expect(adAspectRatio({ width: 0, height: 90 }, "footer")).toBe(
      FALLBACK_AD_RATIO.footer,
    );
    expect(adAspectRatio({ width: 300, height: -1 }, "inline")).toBe(
      FALLBACK_AD_RATIO.inline,
    );
  });

  it("ölçü yoksa yüklenen görselin gerçek oranı varsayılanın önüne geçer", () => {
    expect(adAspectRatio({ width: null, height: null }, "header", 2)).toBe(2);
    expect(adAspectRatio({ width: 728, height: 90 }, "header", 2)).toBeCloseTo(
      728 / 90,
    );
    expect(adAspectRatio({ width: null, height: null }, "header", 0)).toBe(
      FALLBACK_AD_RATIO.header,
    );
    expect(adAspectRatio({ width: null, height: null }, "header", null)).toBe(
      FALLBACK_AD_RATIO.header,
    );
  });

  it("naturalRatioOf: yüklenen görselden oran, ölçüsüzse null", () => {
    expect(naturalRatioOf({ naturalWidth: 970, naturalHeight: 250 })).toBeCloseTo(
      3.88,
    );
    expect(naturalRatioOf({ naturalWidth: 0, naturalHeight: 0 })).toBeNull();
  });
});
