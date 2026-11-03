import { describe, expect, it } from "vitest";
import {
  CROP_WARN_PERCENT,
  DESKTOP_IMAGE_SPEC,
  MOBILE_IMAGE_SPEC,
  cropLoss,
  cropLossFor,
} from "./image-spec";

describe("image specs", () => {
  it("derives the recommended sizes from the media tokens", () => {
    expect(DESKTOP_IMAGE_SPEC).toMatchObject({
      ratioLabel: "4:3",
      width: 1600,
      height: 1200,
    });
    expect(MOBILE_IMAGE_SPEC).toMatchObject({
      ratioLabel: "16:10",
      width: 1600,
      height: 1000,
    });
  });
});

describe("cropLoss", () => {
  it("is zero for an image of the box ratio", () => {
    expect(cropLoss(1.6, 1.6)).toBe(0);
  });

  it("splits a wider image's loss across left and right", () => {
    // 2:1 into 1:1 keeps half the width, so 25 % per side.
    expect(cropLoss(2, 1)).toBeCloseTo(25);
  });

  it("splits a taller image's loss across top and bottom", () => {
    expect(cropLoss(1, 2)).toBeCloseTo(25);
  });

  it("loses 8.3 % per side for a 4:3 image on a 16:10 phone box", () => {
    expect(cropLoss(4 / 3, 16 / 10)).toBeCloseTo(8.33, 1);
  });

  it("ignores invalid ratios", () => {
    expect(cropLoss(0, 1.6)).toBe(0);
    expect(cropLoss(1.6, Number.NaN)).toBe(0);
  });
});

describe("cropLossFor", () => {
  it("reads the natural size against a token box", () => {
    expect(cropLossFor(1600, 1000, { width: 16, height: 10 })).toBe(0);
    expect(cropLossFor(1600, 1200, { width: 16, height: 10 })).toBeCloseTo(
      8.33,
      1,
    );
  });

  it("is zero before the size is known", () => {
    expect(cropLossFor(0, 0, { width: 4, height: 3 })).toBe(0);
  });

  it("puts a 16:10 image over the warning threshold in the 4:3 box", () => {
    expect(cropLossFor(1600, 1000, { width: 4, height: 3 })).toBeGreaterThan(
      CROP_WARN_PERCENT,
    );
  });
});
