import { Prisma, type InstallmentSegment } from "@prisma/client";
import type { InstallmentBuyerSegment } from "@tarodan/types";

/**
 * Which segment rule applies to a count (ADR 0019, plan 4.6.3). Pure: the
 * options call, the admin preview and the signing call resolve with this one
 * function, each with its own `now`.
 *
 * 1. Candidates: unarchived versions valid at `now` (`validFrom <= now <
 *    validUntil`, open-ended when null), of the buyer's segment or `all`,
 *    whose count range holds `count`.
 * 2. Winner: highest priority; on a tie the specific segment beats `all`;
 *    then the newest `createdAt`; then the id (deterministic).
 * 3. No winner: allowed, platform share 0 (the default: the buyer pays all).
 *    A winner with `allowed = false` removes the count.
 */

/** One rule version as the resolver reads it. */
export interface InstallmentRuleCandidate {
  id: string;
  segment: InstallmentSegment;
  minCount: number;
  maxCount: number;
  allowed: boolean;
  platformSharePct: Prisma.Decimal;
  priority: number;
  validFrom: Date;
  validUntil: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface ResolvedInstallmentRule {
  allowed: boolean;
  /** s_n x 100. */
  platformSharePct: Prisma.Decimal;
  /** The winning version; null = the code default. */
  ruleId: string | null;
}

export const DEFAULT_INSTALLMENT_RULE: ResolvedInstallmentRule = Object.freeze({
  allowed: true,
  platformSharePct: new Prisma.Decimal(0),
  ruleId: null,
});

/** Unarchived and inside its validity window at `at`. */
export function isInstallmentRuleLive(
  rule: Pick<
    InstallmentRuleCandidate,
    "validFrom" | "validUntil" | "archivedAt"
  >,
  at: Date,
): boolean {
  if (rule.archivedAt) return false;
  const t = at.getTime();
  if (rule.validFrom.getTime() > t) return false;
  return !rule.validUntil || rule.validUntil.getTime() > t;
}

function ruleMatches(
  rule: InstallmentRuleCandidate,
  segment: InstallmentBuyerSegment,
  count: number,
  at: Date,
): boolean {
  return (
    (rule.segment === segment || rule.segment === "all") &&
    rule.minCount <= count &&
    count <= rule.maxCount &&
    isInstallmentRuleLive(rule, at)
  );
}

/** Negative when `a` wins over `b`. */
function compareCandidates(
  a: InstallmentRuleCandidate,
  b: InstallmentRuleCandidate,
): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aSpecific = a.segment !== "all";
  const bSpecific = b.segment !== "all";
  if (aSpecific !== bSpecific) return aSpecific ? -1 : 1;
  const byAge = b.createdAt.getTime() - a.createdAt.getTime();
  if (byAge !== 0) return byAge;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function resolveInstallmentRule(
  rules: readonly InstallmentRuleCandidate[],
  segment: InstallmentBuyerSegment,
  count: number,
  at: Date,
): ResolvedInstallmentRule {
  let winner: InstallmentRuleCandidate | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, segment, count, at)) continue;
    if (!winner || compareCandidates(rule, winner) < 0) winner = rule;
  }
  if (!winner) return DEFAULT_INSTALLMENT_RULE;
  return {
    allowed: winner.allowed,
    platformSharePct: winner.allowed
      ? winner.platformSharePct
      : new Prisma.Decimal(0),
    ruleId: winner.id,
  };
}

/** The rows that can match a buyer of `segment` at `at` (indexed query). */
export function liveInstallmentRulesWhere(
  segment: InstallmentBuyerSegment,
  at: Date,
): Prisma.InstallmentRuleWhereInput {
  return {
    archivedAt: null,
    segment: { in: [segment, "all"] },
    validFrom: { lte: at },
    OR: [{ validUntil: null }, { validUntil: { gt: at } }],
  };
}
