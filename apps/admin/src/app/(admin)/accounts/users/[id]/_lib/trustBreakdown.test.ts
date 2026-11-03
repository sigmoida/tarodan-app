import { describe, expect, it } from "vitest";
import { fakeT } from "@/test-utils/dom";
import type { Translate } from "@/lib/statusLabels";
import { explanation } from "@/app/(admin)/system/seller-trust-lab/_lib/fixtures";
import { trustExplainRows } from "./trustBreakdown";

const t = fakeT as unknown as Translate;

describe("trustExplainRows", () => {
  it("shows a 4-decimal candidate weight exactly, so the working can be rechecked", () => {
    const base = explanation();
    const rows = trustExplainRows(
      {
        ...base,
        rating: { ...base.rating, weight: 0.1234 },
        reliability: { ...base.reliability, failureRate: 0.034 },
      },
      t,
    );
    const rating = rows.find((r) => r.id === "rating");
    const reliability = rows.find((r) => r.id === "reliability");

    expect(rating?.weight).toBe("%12,34");
    expect(rating?.subScore).toBe("%87,50");
    expect(reliability?.rate).toBe("%3,40");
    expect(rows.find((r) => r.id === "volume")?.rate).toBeUndefined();
  });
});
