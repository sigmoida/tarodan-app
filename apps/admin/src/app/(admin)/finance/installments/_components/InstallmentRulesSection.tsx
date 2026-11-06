"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Alert, Button } from "@tarodan/ui";
import type {
  AdminInstallmentRatesInfo,
  AdminInstallmentRule,
  AdminInstallmentRuleRef,
} from "@tarodan/types";
import { AdminTabs } from "@/components/AdminTabs";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { useClientTableSort } from "@/hooks/useClientTableSort";
import { useTabParam } from "@/hooks/useTabParam";
import { useConfirm } from "@/provider/ConfirmProvider";
import {
  isStaleRuleError,
  useArchiveInstallmentRule,
  type InstallmentRulesQuery,
} from "../_hooks/useInstallmentRules";
import { ruleColumns } from "../_lib/rule-columns";
import { InstallmentRuleFormModal } from "../_modals/InstallmentRuleFormModal";
import { OverlapWarning } from "./OverlapWarning";

const L = "admin.finance.installments.rules";
const TABS = ["current", "archived"] as const;

/**
 * The rule versions: current (active, scheduled, expired) and archived, the
 * create / new version / archive flows (super_admin only) and the overlap
 * warning the API returns after a write.
 */
export function InstallmentRulesSection({
  rulesQuery,
  canEdit,
  rates,
}: {
  /** The page's rules query (the preview reads the same list). */
  rulesQuery: InstallmentRulesQuery;
  canEdit: boolean;
  rates: AdminInstallmentRatesInfo;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const archive = useArchiveInstallmentRule();
  const [tabParam, setTab] = useTabParam("current", { param: "rules" });
  const tab = tabParam === "archived" ? "archived" : "current";
  const [modal, setModal] = useState<{ rule?: AdminInstallmentRule } | null>(
    null,
  );
  const [savedOverlaps, setSavedOverlaps] = useState<AdminInstallmentRuleRef[]>(
    [],
  );

  const rows = useMemo(
    () =>
      rules.filter((rule) => (tab === "archived") === Boolean(rule.archivedAt)),
    [rules, tab],
  );
  const sorted = useClientTableSort(rows);
  const archivedCount = rules.filter((rule) => rule.archivedAt).length;

  const onArchive = (rule: AdminInstallmentRule) =>
    void confirm({
      title: t(`${L}.archiveConfirm.title`),
      description: t(`${L}.archiveConfirm.description`, { name: rule.name }),
      confirmLabel: t(`${L}.actions.archive`),
      cancelLabel: t("common.cancel"),
      destructive: true,
      onConfirm: async () => {
        try {
          await archive.mutateAsync(rule.id);
        } catch (error) {
          // A stale version: the toast says so and the list reloads; a retry
          // of the same version could only fail again, so the dialog closes.
          if (!isStaleRuleError(error)) throw error;
        }
      },
    });

  const columns = ruleColumns(
    t,
    canEdit
      ? {
          onNewVersion: (rule) => setModal({ rule }),
          onArchive,
          archivingId: archive.isPending ? archive.variables : undefined,
        }
      : null,
  );

  return (
    <SectionCard
      title={t(`${L}.title`)}
      actions={
        canEdit && (
          <Button
            leftIcon={<PlusIcon className="h-5 w-5" />}
            onClick={() => setModal({})}
          >
            {t(`${L}.new`)}
          </Button>
        )
      }
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-muted">{t(`${L}.description`)}</p>

      {savedOverlaps.length > 0 && (
        <OverlapWarning
          overlaps={savedOverlaps}
          onClose={() => setSavedOverlaps([])}
        />
      )}

      <AdminTabs
        tabs={TABS.map((key) => ({
          key,
          label: t(`${L}.tabs.${key}`),
          badge:
            key === "archived" ? archivedCount : rules.length - archivedCount,
        }))}
        value={tab}
        onChange={setTab}
      />

      {rulesQuery.isError ? (
        <Alert
          variant="danger"
          title={t(`${L}.loadFailed`)}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rulesQuery.refetch()}
              isLoading={rulesQuery.isRefetching}
            >
              {t("admin.shared.suspense.retry")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={sorted.rows}
          getRowId={(rule) => rule.id}
          loading={rulesQuery.isLoading}
          sort={sorted.sort}
          onSort={sorted.setSort}
          emptyText={
            tab === "archived" ? t(`${L}.emptyArchived`) : t(`${L}.empty`)
          }
          dense
        />
      )}

      {modal && canEdit && (
        <InstallmentRuleFormModal
          key={modal.rule?.id ?? "new"}
          rule={modal.rule}
          rules={rules}
          rates={rates}
          onClose={() => setModal(null)}
          onSaved={(overlaps) => {
            setModal(null);
            setSavedOverlaps(overlaps);
          }}
        />
      )}
    </SectionCard>
  );
}
