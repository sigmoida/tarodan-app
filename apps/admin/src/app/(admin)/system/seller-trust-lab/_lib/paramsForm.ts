import { z } from "zod";
import {
  SELLER_TRUST_PARAM_LIMITS,
  validateSellerTrustParams,
  type SellerTrustFormulaParams,
  type SellerTrustParamField,
  type SellerTrustParamIssue,
  type SellerTrustParamLimit,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import { fmtDecimal } from "@/lib/format";

/** The parameter set with every number held as the text the user typed. */
type Stringified<T> = {
  [K in keyof T]: T[K] extends number ? string : Stringified<T[K]>;
};
export type ParamsFormValues = Stringified<SellerTrustFormulaParams>;

type Tree = { [key: string]: string | number | Tree };

function mapLeaves(node: Tree, fn: (leaf: string | number) => string | number) {
  const out: Tree = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = typeof value === "object" ? mapLeaves(value, fn) : fn(value);
  }
  return out;
}

export function paramsToForm(params: SellerTrustFormulaParams) {
  return mapLeaves(params as unknown as Tree, (n) =>
    String(n),
  ) as unknown as ParamsFormValues;
}

/**
 * Text to number. An empty field is NaN (not 0), so the shared validator
 * refuses it; a decimal comma is accepted.
 */
export function parseFormNumber(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

/** The values as the shared validator wants them; not yet checked. */
export function formToParams(values: ParamsFormValues): unknown {
  return mapLeaves(values as unknown as Tree, (text) =>
    parseFormNumber(String(text)),
  );
}

/** Weights total of what is typed, for the running "total" line. */
export function weightsTotal(values: ParamsFormValues["weights"]): number {
  return Object.values(values).reduce((sum, v) => sum + parseFormNumber(v), 0);
}

/** Catalog key of each parameter's label (next-intl wants literal keys). */
export const PARAM_LABEL_KEY = {
  "weights.rating": "admin.users.detail.trust.components.rating",
  "weights.reliability": "admin.users.detail.trust.components.reliability",
  "weights.onTime": "admin.users.detail.trust.components.onTime",
  "weights.volume": "admin.users.detail.trust.components.volume",
  "weights.tenure": "admin.users.detail.trust.components.tenure",
  "rating.priorMean": "admin.system.sellerTrustLab.params.priorMean",
  "rating.priorWeight": "admin.system.sellerTrustLab.params.priorWeight",
  "reliability.priorRate": "admin.system.sellerTrustLab.params.priorRate",
  "reliability.priorWeight": "admin.system.sellerTrustLab.params.priorWeight",
  "reliability.zeroAt": "admin.system.sellerTrustLab.params.zeroAt",
  "onTime.priorRate": "admin.system.sellerTrustLab.params.priorRate",
  "onTime.priorWeight": "admin.system.sellerTrustLab.params.priorWeight",
  "onTime.zeroAt": "admin.system.sellerTrustLab.params.zeroAt",
  "volume.saturation": "admin.system.sellerTrustLab.params.saturation",
  "tenure.fullAtDays": "admin.system.sellerTrustLab.params.fullAtDays",
  "minimum.transactions": "admin.system.sellerTrustLab.params.minTransactions",
  "minimum.counterparties":
    "admin.system.sellerTrustLab.params.minCounterparties",
} as const satisfies Record<SellerTrustParamField, string>;

/**
 * Message of one validator issue, in the same terms the API answers with
 * (the shared validator is the single rule; this only words it).
 */
export function paramIssueMessage(
  issue: SellerTrustParamIssue,
  t: Translate,
  weightsSumNow: number,
): string {
  const field = issue.field as SellerTrustParamField;
  const label = PARAM_LABEL_KEY[field]
    ? t(PARAM_LABEL_KEY[field])
    : issue.field;
  switch (issue.code) {
    case "weightsSum":
      return t("admin.system.sellerTrustLab.params.errors.weightsSum", {
        sum: fmtDecimal(weightsSumNow, 4) ?? "",
      });
    case "notInteger":
      return t("admin.system.sellerTrustLab.params.errors.integer", {
        field: label,
      });
    case "aboveTransactions":
      return t("admin.system.sellerTrustLab.params.errors.counterparties");
    case "invalidNumber":
      return t("admin.system.sellerTrustLab.scenario.errors.invalidNumber", {
        field: label,
      });
    case "tooManyDecimals": {
      const limit: SellerTrustParamLimit | undefined =
        SELLER_TRUST_PARAM_LIMITS[field];
      return t("admin.system.sellerTrustLab.params.errors.decimals", {
        field: label,
        max: String(limit?.maxDecimals ?? 0),
      });
    }
    default: {
      const limit = SELLER_TRUST_PARAM_LIMITS[field];
      return t("admin.system.sellerTrustLab.params.errors.range", {
        field: label,
        min: fmtDecimal(limit?.min, limit?.integer ? 0 : 2) ?? "",
        max: fmtDecimal(limit?.max, limit?.integer ? 0 : 2) ?? "",
      });
    }
  }
}

const text = z.string();

/**
 * Candidate parameter form. zod only checks the shape; the rules are the
 * shared `validateSellerTrustParams` (the API runs the same), and each issue
 * lands on its field. The weights total, which belongs to no single field,
 * lands on the virtual `weightsSum` field.
 */
export const paramsSchema = (t: Translate) =>
  z
    .object({
      weights: z.object({
        rating: text,
        reliability: text,
        onTime: text,
        volume: text,
        tenure: text,
      }),
      rating: z.object({ priorMean: text, priorWeight: text }),
      reliability: z.object({
        priorRate: text,
        priorWeight: text,
        zeroAt: text,
      }),
      onTime: z.object({ priorRate: text, priorWeight: text, zeroAt: text }),
      volume: z.object({ saturation: text }),
      tenure: z.object({ fullAtDays: text }),
      minimum: z.object({ transactions: text, counterparties: text }),
    })
    .superRefine((parsed, ctx) => {
      // zod infers optional keys here; the object schema above has all of them.
      const values = parsed as ParamsFormValues;
      const sum = weightsTotal(values.weights);
      for (const issue of validateSellerTrustParams(formToParams(values))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path:
            issue.code === "weightsSum"
              ? ["weightsSum"]
              : issue.field.split("."),
          message: paramIssueMessage(issue, t, sum),
        });
      }
    });

/** The checked candidate, or null while the form has an issue. */
export function validParams(
  values: ParamsFormValues,
): SellerTrustFormulaParams | null {
  const params = formToParams(values);
  return validateSellerTrustParams(params).length === 0
    ? (params as SellerTrustFormulaParams)
    : null;
}

const readField = (p: SellerTrustFormulaParams, field: string): unknown =>
  field
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], p);

/** Does any parameter of the candidate differ from v1? */
export function differsFromV1(
  params: SellerTrustFormulaParams,
  v1: SellerTrustFormulaParams,
): boolean {
  return Object.keys(SELLER_TRUST_PARAM_LIMITS).some(
    (field) => readField(params, field) !== readField(v1, field),
  );
}
