import { describe, expect, it } from "vitest";
import {
  AD_SIZE_PRESETS,
  customSize,
  formatSizes,
  groupsAreIdentical,
  matchPreset,
  ratioMismatch,
  recommendedSizes,
  sizeAfterContextChange,
  sizePresetGroups,
} from "./sizePresets";
import { AD_POSITIONS } from "./types";

const dims = (position: string, platform: "web" | "app" | "all") =>
  recommendedSizes(position, platform).map((s) => `${s.width}x${s.height}`);

describe("preset table", () => {
  it("covers every position", () => {
    expect(Object.keys(AD_SIZE_PRESETS).sort()).toEqual(
      [...AD_POSITIONS].sort(),
    );
  });

  it("maps position + platform to the agreed sizes", () => {
    expect(dims("topbar", "web")).toEqual(["970x90"]);
    expect(dims("topbar", "app")).toEqual(["970x90"]);
    for (const p of ["header", "footer", "inline"]) {
      expect(dims(p, "web")).toEqual(["970x250", "728x90"]);
      expect(dims(p, "app")).toEqual(["320x100", "320x50"]);
    }
    expect(dims("popup", "web")).toEqual(["300x250", "250x250"]);
    expect(dims("popup", "app")).toEqual(["320x480", "300x250"]);
  });

  it("never offers the removed skyscraper / half page sizes", () => {
    const all = AD_POSITIONS.flatMap((p) => dims(p, "all"));
    expect(all).not.toContain("160x600");
    expect(all).not.toContain("300x600");
  });

  it("platform=all returns labelled web + app groups, de-duplicated flat", () => {
    const groups = sizePresetGroups("popup", "all");
    expect(groups.map((g) => g.target)).toEqual(["web", "app"]);
    expect(groupsAreIdentical(groups)).toBe(false);
    // 300x250 appears in both groups but once in the flat list
    expect(dims("popup", "all")).toEqual(["300x250", "250x250", "320x480"]);
    expect(groupsAreIdentical(sizePresetGroups("topbar", "all"))).toBe(true);
    expect(dims("topbar", "all")).toEqual(["970x90"]);
  });

  it("unknown position has no presets", () => {
    expect(sizePresetGroups("sidebar", "all")).toEqual([]);
  });
});

describe("customSize", () => {
  it("is null when the size matches a recommendation or is empty", () => {
    expect(customSize("header", "web", { width: 970, height: 250 })).toBeNull();
    expect(customSize("header", "web", { width: 0, height: 0 })).toBeNull();
  });

  it("returns the stored size when it matches no preset for the slot", () => {
    expect(customSize("header", "web", { width: 160, height: 600 })).toEqual({
      width: 160,
      height: 600,
    });
    // valid elsewhere, not for this slot
    expect(customSize("header", "web", { width: 320, height: 100 })).toEqual({
      width: 320,
      height: 100,
    });
    expect(
      matchPreset("header", "all", { width: 320, height: 100 }),
    ).toBeDefined();
  });
});

describe("sizeAfterContextChange", () => {
  const natural = { width: 800, height: 800 };

  it("keeps a preset that still applies", () => {
    const state = {
      size: { width: 970, height: 250 },
      source: "preset" as const,
    };
    expect(
      sizeAfterContextChange({
        position: "footer",
        platform: "web",
        state,
        natural: null,
      }),
    ).toBe(state);
  });

  it("clears a preset that no longer applies", () => {
    expect(
      sizeAfterContextChange({
        position: "header",
        platform: "app",
        state: { size: { width: 970, height: 250 }, source: "preset" },
        natural: null,
      }),
    ).toEqual({ size: { width: 0, height: 0 }, source: "none" });
  });

  it("falls back to the detected image size when a preset is cleared", () => {
    expect(
      sizeAfterContextChange({
        position: "topbar",
        platform: "web",
        state: { size: { width: 728, height: 90 }, source: "preset" },
        natural,
      }),
    ).toEqual({ size: natural, source: "image" });
  });

  it("keeps image-detected and stored dimensions", () => {
    for (const source of ["image", "stored"] as const) {
      const state = { size: { width: 800, height: 800 }, source };
      expect(
        sizeAfterContextChange({
          position: "popup",
          platform: "app",
          state,
          natural,
        }),
      ).toBe(state);
    }
  });
});

describe("ratioMismatch", () => {
  it("warns for a square image in header (web) and says it looks tall", () => {
    const m = ratioMismatch({
      position: "header",
      platform: "web",
      size: { width: 800, height: 800 },
    });
    expect(m?.direction).toBe("tall");
    expect(formatSizes(m!.recommended)).toBe("970×250, 728×90");
  });

  it("warns wide for a very flat image in a popup", () => {
    const m = ratioMismatch({
      position: "popup",
      platform: "web",
      size: { width: 970, height: 90 },
    });
    expect(m?.direction).toBe("wide");
  });

  it("does not warn when the ratio is within 25% of any recommendation", () => {
    expect(
      ratioMismatch({
        position: "header",
        platform: "web",
        size: { width: 1940, height: 500 },
      }),
    ).toBeNull();
    // 728x90 = 8.09; 8.09 * 0.8 ≈ 6.5 is inside tolerance
    expect(
      ratioMismatch({
        position: "header",
        platform: "web",
        size: { width: 1300, height: 200 },
      }),
    ).toBeNull();
  });

  it("considers both web and app ratios when platform=all", () => {
    expect(
      ratioMismatch({
        position: "header",
        platform: "all",
        size: { width: 320, height: 100 },
      }),
    ).toBeNull();
  });

  it("does not warn without a size", () => {
    expect(
      ratioMismatch({
        position: "header",
        platform: "web",
        size: { width: 0, height: 0 },
      }),
    ).toBeNull();
  });

  it("respects a custom tolerance", () => {
    const args = {
      position: "popup",
      platform: "web" as const,
      size: { width: 340, height: 250 },
    };
    expect(ratioMismatch(args)).toBeNull();
    expect(ratioMismatch({ ...args, tolerance: 0.01 })).not.toBeNull();
  });
});
