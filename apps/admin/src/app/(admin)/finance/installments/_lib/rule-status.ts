import type { InstallmentRuleStatus } from "@tarodan/types";
import { STATUS_TONE, type TableBadgeVariant } from "@/lib/status-tone";
import type { Translate } from "@/lib/statusLabels";

/** The shared status tone of each rule version status. */
const RULE_STATUS_TONE = {
  active: STATUS_TONE.live,
  scheduled: STATUS_TONE.pending,
  expired: STATUS_TONE.ended,
  archived: STATUS_TONE.inactive,
} as const satisfies Record<InstallmentRuleStatus, TableBadgeVariant>;

/** `TableBadge` props of a rule version status. */
export const ruleStatusBadge = (
  t: Translate,
  status: InstallmentRuleStatus,
) => ({
  variant: RULE_STATUS_TONE[status],
  children: t(`admin.finance.installments.rules.status.${status}`),
});
