import { pickSellerTrustFormulaParams } from "@tarodan/types";
import { TRUST_FORMULA_V1 } from "../helpers/trust-formula.constants";
import {
  buildProposal,
  summarisePopulation,
  type PopulationRow,
} from "./population-summary.helper";

const at = (iso: string) => new Date(iso);
const T1 = at("2026-11-02T23:30:00.000Z");
const T2 = at("2026-11-03T23:30:00.000Z");

const row = (
  userId: string,
  storedX100: number | null,
  candidateX100: number | null,
  over: Partial<PopulationRow> = {},
): PopulationRow => ({
  userId,
  computedAt: T1,
  storedX100,
  v1X100: storedX100,
  candidateX100,
  ...over,
});

const skips = (rowsRead: number) => ({
  rowsRead,
  skippedOtherVersion: 0,
  skippedUnreadable: 0,
});

describe("summarisePopulation", () => {
  it("is all zeros for no rows", () => {
    const { summary, movers } = summarisePopulation([], skips(0));
    expect(summary.rowsCompared).toBe(0);
    expect(summary.computedAt).toEqual({ min: null, max: null });
    expect(summary.changes).toEqual({
      bothScored: 0,
      changed: 0,
      meanAbsX100: 0,
      maxAbsX100: 0,
    });
    expect(summary.histogram.buckets).toHaveLength(10);
    expect(movers).toEqual({ up: [], down: [] });
  });

  it("counts v1 consistency as matched, off by one or mismatched", () => {
    const { summary } = summarisePopulation(
      [
        row("a", 400, 400),
        row("b", null, null),
        row("c", 400, 400, { v1X100: 401 }),
        row("d", 400, 400, { v1X100: 398 }),
        row("e", 400, 400, { v1X100: null }),
        row("f", null, null, { v1X100: 300 }),
      ],
      skips(6),
    );
    expect(summary.v1Consistency).toEqual({
      matched: 2,
      offByOne: 1,
      mismatched: 3,
    });
  });

  it("builds levels, the 0.5-point histogram and the level matrix", () => {
    const { summary } = summarisePopulation(
      [
        row("a", 500, 449),
        row("b", 450, 450),
        row("c", 0, 49),
        row("d", null, 320),
        row("e", 310, null),
      ],
      skips(5),
    );
    expect(summary.levels.stored).toEqual({
      excellent: 2,
      trusted: 0,
      fair: 1,
      developing: 1,
      new: 1,
    });
    expect(summary.levels.candidate).toEqual({
      excellent: 1,
      trusted: 1,
      fair: 1,
      developing: 1,
      new: 1,
    });
    const bucket = (from: number) =>
      summary.histogram.buckets.find((b) => b.fromX100 === from)!;
    expect(
      summary.histogram.buckets.map((b) => [b.fromX100, b.toX100]),
    ).toEqual(
      [0, 50, 100, 150, 200, 250, 300, 350, 400, 450].map((f) => [f, f + 50]),
    );
    expect(bucket(450)).toMatchObject({ stored: 2, candidate: 1 });
    expect(bucket(400)).toMatchObject({ stored: 0, candidate: 1 });
    expect(bucket(0)).toMatchObject({ stored: 1, candidate: 1 });
    expect(bucket(300)).toMatchObject({ stored: 1, candidate: 1 });
    expect(summary.histogram.new).toEqual({ stored: 1, candidate: 1 });
    expect(summary.levelMatrix.excellent).toMatchObject({
      excellent: 1,
      trusted: 1,
    });
    expect(summary.levelMatrix.new.fair).toBe(1);
    expect(summary.levelMatrix.fair.new).toBe(1);
    expect(summary.newToScored).toBe(1);
    expect(summary.scoredToNew).toBe(1);
  });

  it("measures changes over rows scored on both sides", () => {
    const { summary } = summarisePopulation(
      [
        row("a", 400, 410),
        row("b", 300, 280),
        row("c", 350, 350),
        row("d", null, 300),
      ],
      skips(4),
    );
    expect(summary.changes).toEqual({
      bothScored: 3,
      changed: 2,
      meanAbsX100: 10,
      maxAbsX100: 20,
    });
  });

  it("reports the computedAt spread (a run in progress)", () => {
    const { summary } = summarisePopulation(
      [row("a", 1, 1, { computedAt: T2 }), row("b", 1, 1)],
      skips(2),
    );
    expect(summary.computedAt).toEqual({
      min: T1.toISOString(),
      max: T2.toISOString(),
    });
  });

  it("passes the skip counters through", () => {
    const { summary } = summarisePopulation([row("a", 1, 1)], {
      rowsRead: 4,
      skippedOtherVersion: 2,
      skippedUnreadable: 1,
    });
    expect(summary).toMatchObject({
      rowsRead: 4,
      skippedOtherVersion: 2,
      skippedUnreadable: 1,
      rowsCompared: 1,
    });
  });

  it("ranks densely among scored sellers and lists the largest moves first", () => {
    const { movers } = summarisePopulation(
      [
        row("a", 450, 470),
        row("b", 450, 430),
        row("c", 400, 460),
        row("d", 300, 300),
        row("e", null, 480),
        row("f", 400, 300),
        row("g", 350, 410),
      ],
      skips(7),
    );
    // Stored ranks: 450 -> 1, 400 -> 2, 350 -> 3, 300 -> 4.
    // Candidate ranks: 480, 470, 460, 430, 410, 300 -> 1..6.
    expect(movers.up).toEqual([
      {
        userId: "c",
        storedX100: 400,
        candidateX100: 460,
        storedRank: 2,
        candidateRank: 3,
      },
      {
        userId: "g",
        storedX100: 350,
        candidateX100: 410,
        storedRank: 3,
        candidateRank: 5,
      },
      {
        userId: "a",
        storedX100: 450,
        candidateX100: 470,
        storedRank: 1,
        candidateRank: 2,
      },
    ]);
    expect(movers.down).toEqual([
      {
        userId: "f",
        storedX100: 400,
        candidateX100: 300,
        storedRank: 2,
        candidateRank: 6,
      },
      {
        userId: "b",
        storedX100: 450,
        candidateX100: 430,
        storedRank: 1,
        candidateRank: 4,
      },
    ]);
  });

  it("keeps at most 20 movers each way, ties broken by user id", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(`u${String(29 - i).padStart(2, "0")}`, 300, 310),
    );
    const { movers } = summarisePopulation(rows, skips(30));
    expect(movers.up).toHaveLength(20);
    expect(movers.up[0].userId).toBe("u00");
    expect(movers.up[19].userId).toBe("u19");
    expect(movers.down).toEqual([]);
  });
});

describe("buildProposal", () => {
  it("carries params, filters, summary and environment, and no seller identifier", () => {
    const { summary } = summarisePopulation(
      [row("seller-uuid-1", 400, 450)],
      skips(1),
    );
    const params = pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
    const proposal = buildProposal({
      params,
      filters: { minTransactions: 5 },
      summary,
      environment: { env: "staging", isProd: false },
      generatedAt: T2,
    });
    expect(proposal).toEqual({
      kind: "seller-trust-candidate-proposal",
      baseVersion: 1,
      generatedAt: T2.toISOString(),
      environment: { env: "staging", isProd: false },
      params,
      filters: { minTransactions: 5 },
      summary,
    });
    const json = JSON.stringify(proposal);
    expect(json).not.toContain("seller-uuid-1");
    expect(json).not.toMatch(/"userId"|"username"/);
  });
});
