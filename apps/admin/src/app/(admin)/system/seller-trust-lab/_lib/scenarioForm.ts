import { z } from "zod";
import {
  validateSellerTrustInputs,
  type SellerTrustInputIssue,
  type SellerTrustInputs,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import { parseFormNumber } from "./paramsForm";

/**
 * The scenario form asks for the average rating (1 to 5), which is what
 * people know; the formula wants the sum of the givers' means. The two are
 * converted here, nowhere else.
 */
export const SCENARIO_FIELDS = [
  "raters",
  "meanRating",
  "eligibleOrders",
  "failures",
  "shipped",
  "late",
  "transactions",
  "counterparties",
  "tenureDays",
] as const;
export type ScenarioField = (typeof SCENARIO_FIELDS)[number];
export type ScenarioFormValues = Record<ScenarioField, string>;

export const EMPTY_SCENARIO: ScenarioFormValues = {
  raters: "0",
  meanRating: "0",
  eligibleOrders: "0",
  failures: "0",
  shipped: "0",
  late: "0",
  transactions: "0",
  counterparties: "0",
  tenureDays: "0",
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function inputsToForm(inputs: SellerTrustInputs): ScenarioFormValues {
  return {
    raters: String(inputs.raters),
    meanRating: String(
      inputs.raters > 0 ? round6(inputs.sumOfGiverMeans / inputs.raters) : 0,
    ),
    eligibleOrders: String(inputs.eligibleOrders),
    failures: String(inputs.failures),
    shipped: String(inputs.shipped),
    late: String(inputs.late),
    transactions: String(inputs.transactions),
    counterparties: String(inputs.counterparties),
    tenureDays: String(inputs.tenureDays),
  };
}

/** The form as formula inputs; not yet checked. */
export function formToInputs(values: ScenarioFormValues): unknown {
  const n = (field: ScenarioField) => parseFormNumber(values[field]);
  const raters = n("raters");
  // No raters: the mean means nothing, so it may stay blank or 0.
  const sum = raters === 0 ? 0 : round6(raters * n("meanRating"));
  return {
    raters,
    sumOfGiverMeans: sum,
    eligibleOrders: n("eligibleOrders"),
    failures: n("failures"),
    shipped: n("shipped"),
    late: n("late"),
    transactions: n("transactions"),
    counterparties: n("counterparties"),
    tenureDays: n("tenureDays"),
  };
}

export function validInputs(
  values: ScenarioFormValues,
): SellerTrustInputs | null {
  const inputs = formToInputs(values);
  return validateSellerTrustInputs(inputs).length === 0
    ? (inputs as SellerTrustInputs)
    : null;
}

/** Catalog key of each field's label (next-intl wants literal keys). */
export const SCENARIO_LABEL_KEY = {
  raters: "admin.users.detail.trust.counts.raters",
  meanRating: "admin.system.sellerTrustLab.scenario.meanRating",
  eligibleOrders: "admin.users.detail.trust.counts.eligibleOrders",
  failures: "admin.users.detail.trust.counts.failures",
  shipped: "admin.users.detail.trust.counts.shipped",
  late: "admin.users.detail.trust.counts.late",
  transactions: "admin.users.detail.trust.counts.transactions",
  counterparties: "admin.users.detail.trust.counts.counterparties",
  tenureDays: "admin.users.detail.trust.counts.tenureDays",
} as const satisfies Record<ScenarioField, string>;

/** The form field an input issue belongs to. */
const fieldOf = (issueField: string): ScenarioField =>
  issueField === "sumOfGiverMeans"
    ? "meanRating"
    : (issueField as ScenarioField);

export function inputIssueMessage(
  issue: SellerTrustInputIssue,
  t: Translate,
): string {
  const field = fieldOf(issue.field);
  const label = SCENARIO_LABEL_KEY[field]
    ? t(SCENARIO_LABEL_KEY[field])
    : issue.field;
  switch (issue.code) {
    case "notInteger":
      return t("admin.system.sellerTrustLab.params.errors.integer", {
        field: label,
      });
    case "negative":
      return t("admin.system.sellerTrustLab.scenario.errors.negative", {
        field: label,
      });
    case "ratingSumOutOfRange":
      return t("admin.system.sellerTrustLab.params.errors.range", {
        field: label,
        min: "1",
        max: "5",
      });
    case "aboveEligibleOrders":
      return t(
        "admin.system.sellerTrustLab.scenario.errors.aboveEligibleOrders",
        { field: label },
      );
    case "aboveShipped":
      return t("admin.system.sellerTrustLab.scenario.errors.aboveShipped", {
        field: label,
      });
    case "aboveTransactions":
      return t("admin.system.sellerTrustLab.params.errors.counterparties");
    default:
      return t("admin.system.sellerTrustLab.scenario.errors.invalidNumber", {
        field: label,
      });
  }
}

const text = z.string();

/** zod checks the shape; the rules are the shared `validateSellerTrustInputs`. */
export const scenarioSchema = (t: Translate) =>
  z
    .object({
      raters: text,
      meanRating: text,
      eligibleOrders: text,
      failures: text,
      shipped: text,
      late: text,
      transactions: text,
      counterparties: text,
      tenureDays: text,
    })
    .superRefine((parsed, ctx) => {
      // zod infers optional keys here; the object schema above has all of them.
      const values = parsed as ScenarioFormValues;
      for (const issue of validateSellerTrustInputs(formToInputs(values))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [fieldOf(issue.field)],
          message: inputIssueMessage(issue, t),
        });
      }
    });

/** Catalog key of a golden scenario's name, by the API's scenario key. */
const GOLDEN_NAME_KEY = {
  aNew: "admin.system.sellerTrustLab.golden.name.newSeller",
  dSmallPerfect: "admin.system.sellerTrustLab.golden.name.smallPerfect",
  eSteady: "admin.system.sellerTrustLab.golden.name.steady",
  bGood: "admin.system.sellerTrustLab.golden.name.good",
  fVeteran: "admin.system.sellerTrustLab.golden.name.veteran",
  cProblem: "admin.system.sellerTrustLab.golden.name.problem",
  lovedUnreliable: "admin.system.sellerTrustLab.golden.name.lovedUnreliable",
  reliableUnrated: "admin.system.sellerTrustLab.golden.name.reliableUnrated",
  oneStarWave: "admin.system.sellerTrustLab.golden.name.oneStarWave",
  priorsOnly: "admin.system.sellerTrustLab.golden.name.minimumOnPriors",
} as const;

/** The scenario's name, or its API key for a scenario this page has no name for. */
export function goldenName(key: string, t: Translate): string {
  return key in GOLDEN_NAME_KEY
    ? t(GOLDEN_NAME_KEY[key as keyof typeof GOLDEN_NAME_KEY])
    : key;
}
