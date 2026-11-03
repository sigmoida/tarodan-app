import { describe, expect, it } from "vitest";
import { fakeT } from "@/test-utils/dom";
import type { Translate } from "@/lib/statusLabels";
import { population } from "./fixtures";
import {
  buildFilters,
  hasFilters,
  histogramBars,
  isRunInProgress,
  levelMatrixRows,
  moverRows,
} from "./populationMappers";

const t = fakeT as unknown as Translate;
const none = {
  excellent: false,
  trusted: false,
  fair: false,
  developing: false,
  new: false,
};

describe("population mappers", () => {
  it("sends levels only when some but not all are ticked", () => {
    expect(buildFilters(none, "")).toEqual({});
    expect(buildFilters({ ...none, fair: true, new: true }, "")).toEqual({
      levels: ["fair", "new"],
    });
    expect(
      buildFilters(
        {
          excellent: true,
          trusted: true,
          fair: true,
          developing: true,
          new: true,
        },
        "",
      ),
    ).toEqual({});
  });

  it("sends the minimum transactions only when set", () => {
    expect(buildFilters(none, " 5 ")).toEqual({ minTransactions: 5 });
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ minTransactions: 0 })).toBe(true);
  });

  it("flags a run in progress only when the computed times differ", () => {
    const { summary } = population();
    expect(isRunInProgress(summary)).toBe(false);
    expect(
      isRunInProgress({
        ...summary,
        computedAt: {
          min: "2026-11-02T00:30:00.000Z",
          max: "2026-11-02T01:10:00.000Z",
        },
      }),
    ).toBe(true);
    expect(
      isRunInProgress({ ...summary, computedAt: { min: null, max: null } }),
    ).toBe(false);
  });

  it("lists the score buckets, then the unscored sellers as the last bar", () => {
    const bars = histogramBars(population().summary.histogram, t);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toEqual({ label: "0,0 - 0,5", stored: 1, candidate: 2 });
    expect(bars[2].label).toBe("seller.trustScore.levels.new");
    expect(bars[2].stored).toBe(5);
  });

  it("reads the matrix with stored levels as rows", () => {
    const rows = levelMatrixRows(population().summary.levelMatrix, t);
    expect(rows.map((r) => r.level)).toEqual([
      "excellent",
      "trusted",
      "fair",
      "developing",
      "new",
    ]);
    expect(rows[0].trusted).toBe(2);
  });

  it("shows a mover's score with its rank", () => {
    expect(moverRows(population().movers.up)[0]).toMatchObject({
      username: "riser",
      stored: "3,00 (#9)",
      candidate: "3,40 (#4)",
    });
  });
});
