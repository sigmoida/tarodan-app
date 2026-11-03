import { readFileSync } from "fs";
import { join } from "path";
import { sellerTrustLevel, SELLER_TRUST_LEVELS } from "@tarodan/types";
import {
  computeSellerTrust,
  type SellerTrustInputs,
  type SellerTrustResult,
} from "./trust-formula";

/**
 * Pins formula v1 on 1,000 seeded synthetic inputs. The expected values were
 * produced once by the formula code BEFORE the parameter refactor
 * (tarodan-ops plan 2026-11-03-seller-trust-score-lab, section 4.1) with
 * `scripts/generate-seller-trust-v1-pin.ts`, and are compared exactly: the
 * same arithmetic in the same order gives the same doubles.
 *
 * A failure here means v1 changed. Never regenerate the fixture to make it
 * pass: fix the code, or bump SELLER_TRUST_FORMULA_VERSION through ADR 0014's
 * process and give the new version its own pin.
 */
interface V1Pin {
  formulaVersion: number;
  seed: number;
  inputColumns: Array<keyof SellerTrustInputs>;
  expectedColumns: string[];
  inputs: number[][];
  expected: Array<[number | null, ...number[]]>;
}

const pin = JSON.parse(
  readFileSync(join(__dirname, "trust-formula.v1-pin.json"), "utf8"),
) as V1Pin;

const INPUT_COLUMNS: Array<keyof SellerTrustInputs> = [
  "raters",
  "sumOfGiverMeans",
  "eligibleOrders",
  "failures",
  "shipped",
  "late",
  "transactions",
  "counterparties",
  "tenureDays",
];

const toInputs = (row: number[]): SellerTrustInputs =>
  Object.fromEntries(
    INPUT_COLUMNS.map((key, i) => [key, row[i]]),
  ) as unknown as SellerTrustInputs;

/** The whole stored result, rebuilt from the pinned columns. */
function expectedResult(
  inputs: SellerTrustInputs,
  row: V1Pin["expected"][number],
): SellerTrustResult {
  const [scoreX100, smoothed, s1, s2, s3, s4, s5] = row;
  return {
    scoreX100,
    components: {
      version: 1,
      rating: { raters: inputs.raters, smoothed, subScore: s1 },
      reliability: {
        eligibleOrders: inputs.eligibleOrders,
        failures: inputs.failures,
        subScore: s2,
      },
      onTime: { shipped: inputs.shipped, late: inputs.late, subScore: s3 },
      volume: {
        transactions: inputs.transactions,
        counterparties: inputs.counterparties,
        subScore: s4,
      },
      tenure: { days: inputs.tenureDays, subScore: s5 },
    },
  };
}

describe("formula v1 pin (1,000 seeded inputs)", () => {
  it("is the v1 fixture with 1,000 cases in the expected column order", () => {
    expect(pin.formulaVersion).toBe(1);
    expect(pin.inputColumns).toEqual(INPUT_COLUMNS);
    expect(pin.expectedColumns).toEqual([
      "scoreX100",
      "rating.smoothed",
      "rating.subScore",
      "reliability.subScore",
      "onTime.subScore",
      "volume.subScore",
      "tenure.subScore",
    ]);
    expect(pin.inputs).toHaveLength(1_000);
    expect(pin.expected).toHaveLength(1_000);
  });

  it("covers every level, so the pin is not trivially narrow", () => {
    const levels = new Set(
      pin.expected.map(([x100]) => sellerTrustLevel(x100)),
    );
    expect([...levels].sort()).toEqual([...SELLER_TRUST_LEVELS].sort());
  });

  it("computes exactly the pinned score and breakdown for every case", () => {
    const drift: string[] = [];
    pin.inputs.forEach((row, i) => {
      const inputs = toInputs(row);
      const actual = computeSellerTrust(inputs);
      const expected = expectedResult(inputs, pin.expected[i]);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        drift.push(
          `#${i} ${JSON.stringify(row)}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
        );
      }
    });
    // One readable list instead of 1,000 tests; the first few are enough.
    expect(drift.slice(0, 5)).toEqual([]);
    expect(drift).toHaveLength(0);
  });
});
