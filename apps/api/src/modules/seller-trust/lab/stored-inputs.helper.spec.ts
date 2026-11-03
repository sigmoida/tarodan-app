import type { SellerTrustInputs } from "@tarodan/types";
import { computeSellerTrust } from "../helpers/trust-formula";
import { SELLER_TRUST_GOLDEN_V1 } from "../helpers/trust-golden-v1";
import { trustInputs } from "../testing/trust-inputs-fixture";
import { loadV1PinInputs } from "../testing/trust-v1-pin-fixture";
import { changedTrustInputs, storedTrustInputs } from "./stored-inputs.helper";

/** The 1,000 seeded inputs pinned before the params refactor (T1). */
const pinned = loadV1PinInputs();

describe("storedTrustInputs", () => {
  it("rebuilds every count exactly and the rating sum from the smoothed mean", () => {
    const inputs = SELLER_TRUST_GOLDEN_V1[4].inputs;
    const rebuilt = storedTrustInputs(computeSellerTrust(inputs).components);
    expect(rebuilt).toEqual({
      ...inputs,
      sumOfGiverMeans: expect.closeTo(inputs.sumOfGiverMeans, 2),
    });
  });

  it("gives a zero rating sum without raters", () => {
    const inputs = trustInputs({ eligibleOrders: 3, shipped: 3 });
    expect(storedTrustInputs(computeSellerTrust(inputs).components)).toEqual(
      inputs,
    );
  });

  it("recomputes the stored v1 score within 0.01 for every pinned and golden input", () => {
    const all = [...pinned, ...SELLER_TRUST_GOLDEN_V1.map((g) => g.inputs)];
    expect(all.length).toBeGreaterThan(1000);
    let exact = 0;
    for (const inputs of all) {
      const stored = computeSellerTrust(inputs);
      const rebuilt = storedTrustInputs(stored.components);
      expect(rebuilt).not.toBeNull();
      const again = computeSellerTrust(rebuilt!).scoreX100;
      if (stored.scoreX100 === null) {
        expect(again).toBeNull();
        exact += 1;
        continue;
      }
      expect(Math.abs(again! - stored.scoreX100)).toBeLessThanOrEqual(1);
      if (again === stored.scoreX100) exact += 1;
    }
    // Off by one only at an exact rounding boundary: rare.
    expect(exact / all.length).toBeGreaterThan(0.99);
  });

  it.each([
    ["null", null],
    ["another version", { version: 2 }],
    ["a breakdown without the rating", { version: 1 }],
    [
      "a negative count",
      {
        ...computeSellerTrust(trustInputs()).components,
        onTime: { shipped: -1, late: 0, subScore: 0 },
      },
    ],
    [
      "late above shipped",
      {
        ...computeSellerTrust(trustInputs()).components,
        onTime: { shipped: 1, late: 2, subScore: 0 },
      },
    ],
  ])("is null for %s", (_name, components) => {
    expect(storedTrustInputs(components)).toBeNull();
  });
});

describe("changedTrustInputs", () => {
  const base = SELLER_TRUST_GOLDEN_V1[3].inputs;
  const components = (i: SellerTrustInputs) => computeSellerTrust(i).components;

  it("is empty when nothing changed", () => {
    expect(changedTrustInputs(components(base), components(base))).toEqual([]);
  });

  it("names each changed input with its stored and live value", () => {
    const later = {
      ...base,
      raters: base.raters + 1,
      sumOfGiverMeans: base.sumOfGiverMeans + 1,
      late: base.late + 1,
      tenureDays: base.tenureDays + 1,
    };
    const before = components(base);
    const after = components(later);
    expect(changedTrustInputs(before, after)).toEqual([
      { field: "raters", stored: base.raters, live: later.raters },
      {
        field: "smoothed",
        stored: before.rating.smoothed,
        live: after.rating.smoothed,
      },
      { field: "late", stored: base.late, live: later.late },
      { field: "tenureDays", stored: base.tenureDays, live: later.tenureDays },
    ]);
  });

  it("reports a value missing from the stored row as stored null", () => {
    const changes = changedTrustInputs({ version: 1 }, components(base));
    expect(changes).toHaveLength(9);
    expect(changes.every((c) => c.stored === null)).toBe(true);
  });
});
