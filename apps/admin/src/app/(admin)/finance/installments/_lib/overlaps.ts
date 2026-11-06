import {
  installmentRulesOverlap,
  validateInstallmentRule,
  type AdminInstallmentRule,
  type AdminInstallmentRuleRef,
  type InstallmentRuleField,
  type InstallmentRuleInput,
} from "@tarodan/types";

/** The fields the overlap compares; other errors (a name) do not hide it. */
const OVERLAP_FIELDS: readonly InstallmentRuleField[] = [
  "segment",
  "minCount",
  "maxCount",
  "priority",
  "validFrom",
  "validUntil",
];

/**
 * The current rule versions a rule being written would overlap (the same
 * priority, a shared segment, count and time): the warning the API also
 * returns after the write, computed with the same shared function before
 * saving. The rule's own lineage (the version it replaces) is left out.
 * While a compared field is invalid nothing overlaps (its error is shown).
 */
export function overlappingRules(
  input: InstallmentRuleInput,
  rules: readonly AdminInstallmentRule[],
  ownLineageId?: string,
): AdminInstallmentRuleRef[] {
  const comparable = validateInstallmentRule(input).every(
    (violation) => !OVERLAP_FIELDS.includes(violation.field),
  );
  if (!comparable) return [];
  return rules
    .filter(
      (rule) =>
        rule.lineageId !== ownLineageId && installmentRulesOverlap(input, rule),
    )
    .map(({ id, lineageId, version, name }) => ({
      id,
      lineageId,
      version,
      name,
    }));
}
