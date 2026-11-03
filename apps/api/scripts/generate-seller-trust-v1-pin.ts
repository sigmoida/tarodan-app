/**
 * One-off generator of the seller trust formula v1 pin
 * (`src/modules/seller-trust/helpers/trust-formula.v1-pin.json`, read by
 * `trust-formula.v1-pin.spec.ts`).
 *
 * The fixture was generated ONCE, by the formula code as it was before the
 * parameter refactor (tarodan-ops plan 2026-11-03-seller-trust-score-lab,
 * section 4.1), and committed. Never regenerate it for v1: a pin that is
 * rewritten from the code it pins proves nothing. A new formula version gets
 * its own pin file.
 *
 * Run from apps/api:
 *   npx ts-node -r tsconfig-paths/register scripts/generate-seller-trust-v1-pin.ts
 *
 * The inputs are synthetic (a seeded PRNG), never production data.
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { computeSellerTrust } from "../src/modules/seller-trust/helpers/trust-formula";

const SEED = 20_261_103;
const COUNT = 1_000;
const OUT = join(
  __dirname,
  "../src/modules/seller-trust/helpers/trust-formula.v1-pin.json",
);

/** mulberry32: small, fast, deterministic across Node versions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const rand = mulberry32(SEED);
const int = (min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

/**
 * One synthetic seller. A share of the cases is tiny so the priors and the
 * minimum-data boundary are well covered; the rest spans past every
 * saturation point. The counts respect the real invariants: F + S <= E,
 * L <= S, ceil(N / 3) <= counterparties <= N (at most 3 per counterparty).
 */
function sampleInputs(): number[] {
  const tiny = rand() < 0.2;

  const raters = rand() < 0.1 ? 0 : tiny ? int(0, 6) : int(0, 250);
  // Each giver's mean in hundredths, skewed to the top of the scale.
  let sumHundredths = 0;
  const lowWave = rand() < 0.1;
  for (let g = 0; g < raters; g++) {
    const r = rand();
    const mean = lowWave ? 1 + 4 * r * r : 5 - 4 * r * r * r;
    sumHundredths += Math.round(mean * 100);
  }
  const sumOfGiverMeans = sumHundredths / 100;

  const eligibleOrders = rand() < 0.1 ? 0 : tiny ? int(0, 6) : int(0, 400);
  const failureShare = rand() < 0.15 ? 0.2 + 0.8 * rand() : rand() ** 3 * 0.3;
  const failures = Math.floor(eligibleOrders * failureShare);
  const shipped = Math.max(0, eligibleOrders - failures - int(0, 2));
  const lateShare = rand() < 0.15 ? 0.3 + 0.7 * rand() : rand() ** 2 * 0.4;
  const late = Math.floor(shipped * lateShare);

  const transactions = rand() < 0.1 ? 0 : tiny ? int(0, 7) : int(0, 300);
  const counterparties =
    transactions === 0 ? 0 : int(Math.ceil(transactions / 3), transactions);

  const tenureDays = tiny ? int(0, 60) : int(0, 2_500);

  return [
    raters,
    sumOfGiverMeans,
    eligibleOrders,
    failures,
    shipped,
    late,
    transactions,
    counterparties,
    tenureDays,
  ];
}

const inputs: number[][] = [];
const expected: Array<Array<number | null>> = [];
for (let i = 0; i < COUNT; i++) {
  const row = sampleInputs();
  const [
    raters,
    sumOfGiverMeans,
    eligibleOrders,
    failures,
    shipped,
    late,
    transactions,
    counterparties,
    tenureDays,
  ] = row;
  const { scoreX100, components: c } = computeSellerTrust({
    raters,
    sumOfGiverMeans,
    eligibleOrders,
    failures,
    shipped,
    late,
    transactions,
    counterparties,
    tenureDays,
  });
  inputs.push(row);
  expected.push([
    scoreX100,
    c.rating.smoothed,
    c.rating.subScore,
    c.reliability.subScore,
    c.onTime.subScore,
    c.volume.subScore,
    c.tenure.subScore,
  ]);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      description:
        "Seller trust formula v1 outputs on seeded synthetic inputs, generated once by the pre-refactor code (scripts/generate-seller-trust-v1-pin.ts). Never regenerate for v1.",
      formulaVersion: 1,
      seed: SEED,
      inputColumns: [
        "raters",
        "sumOfGiverMeans",
        "eligibleOrders",
        "failures",
        "shipped",
        "late",
        "transactions",
        "counterparties",
        "tenureDays",
      ],
      expectedColumns: [
        "scoreX100",
        "rating.smoothed",
        "rating.subScore",
        "reliability.subScore",
        "onTime.subScore",
        "volume.subScore",
        "tenure.subScore",
      ],
      inputs,
      expected,
    },
    null,
    2,
  )}\n`,
);
console.log(`wrote ${COUNT} cases to ${OUT}`);
