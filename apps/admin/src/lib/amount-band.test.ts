import { describe, expect, it } from "vitest";
import { amountBandLabel, inclusiveBandMaximum } from "./amount-band";

describe("inclusiveBandMaximum", () => {
  it.each([
    [999, 998.99],
    [1000, 999.99],
    [5000, 4999.99],
    [2500.5, 2500.49],
    [0.01, 0],
    [0, 0],
  ])("shows the last cent inside a band ending at %s", (max, inclusive) => {
    expect(inclusiveBandMaximum(max)).toBe(inclusive);
  });

  it("keeps an open-ended band open", () => {
    expect(inclusiveBandMaximum(null)).toBeNull();
  });
});

describe("amountBandLabel", () => {
  it("labels touching bands without an overlap at the shared bound", () => {
    expect(amountBandLabel(0, 1000)).toBe("₺0,00 – ₺999,99");
    expect(amountBandLabel(1000, 5000)).toBe("₺1.000,00 – ₺4.999,99");
  });

  it("labels an open-ended band with no upper limit", () => {
    expect(amountBandLabel(5000, null)).toBe("₺5.000,00 – ∞");
  });

  it("shows the gap a 999 upper bound leaves before a band from 1000", () => {
    expect(amountBandLabel(200, 999)).toBe("₺200,00 – ₺998,99");
  });
});
