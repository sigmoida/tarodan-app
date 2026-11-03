import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import {
  parseSellerTrustInputs,
  parseSellerTrustParams,
  pickSellerTrustFormulaParams,
  type SellerTrustFormulaParams,
  type SellerTrustInputs,
  type SellerTrustLabPopulationFilters,
} from "@tarodan/types";
import { i18nMessage } from "../../i18n";

/**
 * Lab request values, validated once by the shared validators
 * (`@tarodan/types`) before any work: the lab computes with the returned
 * copy, never with the request object. A refusal is a 400 naming the first
 * offending field, the same rule the admin form applies.
 */

/** Candidate params (required). */
export function parseCandidateParams(raw: unknown): SellerTrustFormulaParams {
  const parsed = parseSellerTrustParams(raw);
  if (parsed.ok) return parsed.value;
  throw new BadRequestException(
    i18nMessage("server.sellerTrustLab.invalidParams", {
      field: parsed.issues[0].field || "params",
    }),
  );
}

/** Candidate params, or null when none were sent (absent or null). */
export function parseOptionalCandidateParams(
  raw: unknown,
): SellerTrustFormulaParams | null {
  return raw === undefined || raw === null ? null : parseCandidateParams(raw);
}

/** Hypothetical inputs of the scenario calculator. */
export function parseScenarioInputs(raw: unknown): SellerTrustInputs {
  const parsed = parseSellerTrustInputs(raw);
  if (parsed.ok) return parsed.value;
  throw new BadRequestException(
    i18nMessage("server.sellerTrustLab.invalidInputs", {
      field: parsed.issues[0].field || "inputs",
    }),
  );
}

/**
 * Filters with no-ops removed: an empty or absent level list means every
 * level, so the response and the audit row carry one canonical shape.
 */
export function normalisePopulationFilters(
  filters: SellerTrustLabPopulationFilters | undefined,
): SellerTrustLabPopulationFilters {
  const out: SellerTrustLabPopulationFilters = {};
  if (filters?.levels && filters.levels.length > 0) {
    out.levels = [...new Set(filters.levels)];
  }
  if (filters?.minTransactions !== undefined) {
    out.minTransactions = filters.minTransactions;
  }
  return out;
}

/**
 * A short fingerprint of a candidate for the audit row: the same candidate
 * always gives the same hash (fields in one fixed order), so audit rows of
 * one experiment can be grouped without storing the values.
 */
export function candidateParamsHash(params: SellerTrustFormulaParams): string {
  return createHash("sha256")
    .update(JSON.stringify(pickSellerTrustFormulaParams(params)))
    .digest("hex")
    .slice(0, 16);
}
