"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";
import {
  PlusIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { extractList } from "@/lib/extract";
import { clientListFetcher } from "@/lib/query/client-list";
import { ResourceList, useResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { CommissionSummary } from "./_components/CommissionSummary";
import { TradeRateCard } from "./_components/TradeRateCard";
import { CommissionTable } from "./_components/CommissionTable";
import { CommissionRuleFormModal } from "./_modals/CommissionRuleFormModal";
import { type CommissionRule, isDefaultRule } from "./_lib/types";

// Full-load (client-side sort/search/pagination): commission rules are a small,
// bounded config set, so we fetch all and paginate in memory. Revisit (move to
// the server contract) only if the ruleset ever grows large (#383).
const commissionRulesFetcher = clientListFetcher<CommissionRule>(
  () => adminApi.getCommissionRules(),
  (raw) => extractList<CommissionRule>(raw),
);

function CommissionRulesContent({
  onEdit,
  onDelete,
  onToggle,
  togglingId,
}: {
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
  onToggle: (rule: CommissionRule) => void;
  togglingId?: string;
}) {
  const t = useTranslations();
  const { rows } = useResourceList<CommissionRule>();
  const hasDefaultRule = rows.some(isDefaultRule);

  return (
    <>
      {!hasDefaultRule && (
        <Alert
          variant="warning"
          title={t("admin.finance.commission.defaultMissingTitle")}
          icon={<ExclamationTriangleIcon className="h-5 w-5" />}
        >
          {t("admin.finance.commission.defaultMissingDescription")}
        </Alert>
      )}
      <CommissionTable
        onEdit={onEdit}
        onDelete={onDelete}
        onToggle={onToggle}
        togglingId={togglingId}
      />
    </>
  );
}

export default function CommissionPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ rule?: CommissionRule } | null>(null);

  const toggle = useAdminMutation(
    (rule: CommissionRule) =>
      adminApi.updateCommissionRule(rule.id, { isActive: !rule.isActive }),
    {
      invalidates: ["commission-rules"],
      successMessage: t("admin.finance.commission.ruleStatusUpdated"),
    },
  );
  const remove = useAdminMutation(
    (id: string) => adminApi.deleteCommissionRule(id),
    {
      invalidates: ["commission-rules"],
      successMessage: t("admin.finance.commission.ruleDeleted"),
    },
  );

  const onDelete = async (rule: CommissionRule) => {
    await confirm({
      title: t("admin.finance.commission.deleteRule"),
      description: t("admin.finance.commission.deleteRuleDescription"),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: () => remove.mutateAsync(rule.id),
    });
  };

  return (
    <ResourceList<CommissionRule>
      resource="commission-rules"
      fetcher={commissionRulesFetcher}
      getRowId={(rule) => rule.id}
      limit={1000}
    >
      <ResourceList.Header
        title={t("admin.finance.commission.title")}
        description={t("admin.finance.commission.subtitle")}
        actions={
          <Button
            leftIcon={<PlusIcon className="h-5 w-5" />}
            onClick={() => setModal({})}
          >
            {t("admin.finance.commission.newRule")}
          </Button>
        }
      />
      <CommissionSummary />
      <Alert
        variant="info"
        title={t("admin.finance.commission.calculationTitle")}
        icon={<InformationCircleIcon className="h-5 w-5" />}
      >
        {t("admin.finance.commission.calculationDescription")}
      </Alert>
      <TradeRateCard />
      <CommissionRulesContent
        onEdit={(rule) => setModal({ rule })}
        onDelete={onDelete}
        onToggle={(rule) => toggle.mutate(rule)}
        togglingId={toggle.isPending ? toggle.variables?.id : undefined}
      />

      {modal && (
        <CommissionRuleFormModal
          key={modal.rule?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          rule={modal.rule}
        />
      )}
    </ResourceList>
  );
}
