import {
  ArchiveBoxIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import type { AdminInstallmentRule } from "@tarodan/types";
import { col } from "@/components/table";
import { fmtDateTime } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";
import { fmtShare } from "./preview-columns";
import { ruleStatusBadge } from "./rule-status";
import { installmentSegmentLabel } from "./segments";

const L = "admin.finance.installments.rules";

/** `2-3 installments`, or `3 installments` for a one-count rule. */
export const ruleCountsLabel = (t: Translate, rule: AdminInstallmentRule) =>
  rule.minCount === rule.maxCount
    ? t(`${L}.countSingle`, { count: rule.minCount })
    : t(`${L}.countRange`, { min: rule.minCount, max: rule.maxCount });

/** What the rule does to its counts: not offered, buyer pays, or a share. */
export function ruleEffectLabel(t: Translate, rule: AdminInstallmentRule) {
  if (!rule.allowed) return t(`${L}.effectNotOffered`);
  if (rule.platformSharePct === 0) return t(`${L}.effectBuyerPays`);
  return t(`${L}.effectShare`, {
    share: fmtShare(rule.platformSharePct) ?? "",
  });
}

export interface RuleRowActions {
  onNewVersion: (rule: AdminInstallmentRule) => void;
  onArchive: (rule: AdminInstallmentRule) => void;
  /** The rule whose archive is running (its menu shows a spinner). */
  archivingId?: string;
}

/**
 * The rule versions table. The row menu (new version, archive) exists only
 * for super_admin and only on versions that are not archived.
 */
export const ruleColumns = (t: Translate, actions: RuleRowActions | null) => [
  col.title<AdminInstallmentRule>(
    t(`${L}.columns.name`),
    (rule) => ({
      title: rule.name,
      secondary: t(`${L}.version`, { version: rule.version }),
    }),
    { sortKey: "name" },
  ),
  col.text<AdminInstallmentRule>(
    t(`${L}.columns.segment`),
    (rule) => installmentSegmentLabel(t, rule.segment),
    // The label is translated; sorting the enum code would look random.
    { sortable: false },
  ),
  col.text<AdminInstallmentRule>(
    t(`${L}.columns.counts`),
    (rule) => ruleCountsLabel(t, rule),
    { sortKey: "minCount", sortType: "number" },
  ),
  col.text<AdminInstallmentRule>(
    t(`${L}.columns.effect`),
    (rule) => ruleEffectLabel(t, rule),
    { sortKey: "platformSharePct", sortType: "number" },
  ),
  col.number<AdminInstallmentRule>(t(`${L}.columns.priority`), "priority"),
  col.stacked<AdminInstallmentRule>(
    t(`${L}.columns.validity`),
    (rule) => ({
      value: fmtDateTime(rule.validFrom),
      secondary: rule.validUntil
        ? t(`${L}.until`, { date: fmtDateTime(rule.validUntil) ?? "" })
        : t(`${L}.openEnded`),
    }),
    { sortKey: "validFrom", sortType: "date" },
  ),
  col.status<AdminInstallmentRule>(
    t("common.status"),
    (rule) => ruleStatusBadge(t, rule.status),
    { sortable: false },
  ),
  col.stacked<AdminInstallmentRule>(
    t(`${L}.columns.created`),
    (rule) => ({
      value: fmtDateTime(rule.createdAt),
      secondary: rule.createdBy,
    }),
    { sortKey: "createdAt", sortType: "date" },
  ),
  ...(actions
    ? [
        col.rowMenu<AdminInstallmentRule>((rule) =>
          rule.archivedAt
            ? []
            : [
                {
                  label: t(`${L}.actions.newVersion`),
                  icon: DocumentDuplicateIcon,
                  onClick: () => actions.onNewVersion(rule),
                  disabled: !!actions.archivingId,
                },
                {
                  label: t(`${L}.actions.archive`),
                  icon: ArchiveBoxIcon,
                  onClick: () => actions.onArchive(rule),
                  destructive: true,
                  isLoading: actions.archivingId === rule.id,
                  disabled: !!actions.archivingId,
                },
              ],
        ),
      ]
    : []),
];
