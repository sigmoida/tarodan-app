/** @format */

import { describe, expect, it } from "vitest";
import { FALLBACK_AD_RATIO, adAspectRatio } from "./adAspect";

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
});
