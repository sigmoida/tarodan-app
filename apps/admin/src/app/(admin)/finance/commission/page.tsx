"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Alert, Button, Input, Select } from "@tarodan/ui";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { clientListFetcher } from "@/lib/query/client-list";
import { ResourceList, useResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { useSession } from "@/context/SessionContext";
import { CommissionSummary } from "./_components/CommissionSummary";
import { CommissionTable } from "./_components/CommissionTable";
import { CommissionRuleDeepLink } from "./_components/CommissionRuleDeepLink";
import { CommissionRuleFormModal } from "./_modals/CommissionRuleFormModal";
import { CommissionRuleDetailModal } from "./_modals/CommissionRuleDetailModal";
import {
  sellerTypes,
  type CommissionCoverageValidation,
  type CommissionRule,
  type CommissionRuleSet,
  type SellerType,
} from "./_lib/types";

const commissionRulesFetcher = clientListFetcher<CommissionRule>(
  () => adminApi.getCommissionRules(),
  (raw) => extractList<CommissionRule>(raw),
);

function RuleResolver({ draft }: { draft?: CommissionRuleSet }) {
  const t = useTranslations();
  const { data: categories = [] } = useCategories();
  const [categoryId, setCategoryId] = useState("");
  const [sellerType, setSellerType] = useState<SellerType>("FREE");
  const [amount, setAmount] = useState("1000");
  const preview = useMutation({
    mutationFn: async () =>
      (
        await adminApi.previewCommissionRule({
          ruleSetId: draft?.id,
          categoryId,
          sellerType,
          amount: Number(amount),
        })
      ).data,
  });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold text-heading">
          {t("admin.finance.commission.resolverTitle")}
        </h2>
        <p className="text-sm text-muted">
          {t("admin.finance.commission.resolverHint", {
            set: draft
              ? t("admin.finance.commission.draftVersion", {
                  version: draft.version,
                })
              : t("admin.finance.commission.activeSet"),
          })}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Select
          label={t("common.category")}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          options={categories.map((category) => ({
            value: category.id,
            label: category.name,
          }))}
        />
        <Select
          label={t("admin.finance.commission.sellerType")}
          value={sellerType}
          onChange={(event) => setSellerType(event.target.value as SellerType)}
          options={sellerTypes(t)}
        />
        <Input
          label={t("admin.finance.commission.productPrice")}
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={!categoryId || !amount || preview.isPending}
            onClick={() => preview.mutate()}
          >
            {t("admin.finance.commission.resolveRule")}
          </Button>
        </div>
      </div>
      {preview.isSuccess && (
        <Alert variant="success" title={preview.data.ruleName}>
          {t("admin.finance.commission.resolverSuccess", {
            ruleId: preview.data.ruleId,
            ruleSetId: preview.data.ruleSetId,
            sellerFee: preview.data.sellerFeeAmount,
            buyerFee: preview.data.buyerFeeAmount,
          })}
        </Alert>
      )}
      {preview.isError && (
        <Alert
          variant="warning"
          title={t("admin.finance.commission.resolverNoMatchTitle")}
        >
          {t("admin.finance.commission.resolverNoMatchDescription")}
        </Alert>
      )}
    </div>
  );
}

function CommissionRulesContent({
  editable,
  validation,
  onEdit,
  onDelete,
}: {
  editable: boolean;
  validation?: CommissionCoverageValidation;
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
}) {
  const t = useTranslations();
  const { rows } = useResourceList<CommissionRule>();
  const shownSet = rows[0]?.ruleSet;
  return (
    <>
      <Alert
        variant={editable ? "default" : "warning"}
        title={
          editable
            ? t("admin.finance.commission.draftEditingTitle", {
                version: shownSet?.version ?? "",
              })
            : t("admin.finance.commission.publishedReadonlyTitle")
        }
      >
        {editable
          ? t("admin.finance.commission.draftEditingDescription")
          : t("admin.finance.commission.publishedReadonlyDescription")}
      </Alert>
      {editable && validation && !validation.valid && (
        <Alert
          variant="warning"
          title={t("admin.finance.commission.coverageIssuesTitle", {
            count: validation.errors.length,
          })}
          icon={<ExclamationTriangleIcon className="h-5 w-5" />}
        >
          {validation.errors.slice(0, 8).map((error) => (
            <div
              key={`${error.categoryId}-${error.sellerType}-${error.message}`}
            >
              {error.categoryName} / {error.sellerType}: {error.message}
            </div>
          ))}
          {validation.errors.length > 8 && (
            <div>
              {t("admin.finance.commission.moreCoverageIssues", {
                count: validation.errors.length - 8,
              })}
            </div>
          )}
        </Alert>
      )}
      {editable && validation?.valid && (
        <Alert
          variant="success"
          title={t("admin.finance.commission.coverageCompleteTitle")}
          icon={<CheckCircleIcon className="h-5 w-5" />}
        >
          {t("admin.finance.commission.coverageCompleteDescription", {
            categories: validation.activeCategoryCount,
            axes: validation.requiredAxisCount,
          })}
        </Alert>
      )}
      <CommissionTable
        editable={editable}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </>
  );
}

export default function CommissionPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const { user } = useSession();
  const canEdit = user.role === "super_admin";
  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; rule: CommissionRule }
    | { mode: "view"; rule: CommissionRule }
    | null
  >(null);
  const openRule = useCallback(
    (rule: CommissionRule) =>
      setModal(
        rule.ruleSet?.status === "DRAFT" && canEdit
          ? { mode: "edit", rule }
          : { mode: "view", rule },
      ),
    [canEdit],
  );

  const setsQuery = useQuery<CommissionRuleSet[]>({
    queryKey: adminKeys.all("commission-rule-sets"),
    queryFn: async () =>
      extractList<CommissionRuleSet>(
        (await adminApi.getCommissionRuleSets()).data,
      ),
  });
  const draft = setsQuery.data?.find((set) => set.status === "DRAFT");
  const validationQuery = useQuery<CommissionCoverageValidation>({
    queryKey: adminKeys.options(
      `commission-rule-set-validation-${draft?.id ?? "none"}`,
    ),
    queryFn: async () =>
      (await adminApi.validateCommissionRuleSet(draft!.id)).data,
    enabled: Boolean(draft),
  });

  const createDraft = useAdminMutation(
    () => adminApi.createCommissionRuleSetDraft(),
    {
      invalidates: ["commission-rules", "commission-rule-sets"],
      successMessage: t("admin.finance.commission.draftCreated"),
    },
  );
  const publish = useAdminMutation(
    (id: string) => adminApi.publishCommissionRuleSet(id),
    {
      invalidates: ["commission-rules", "commission-rule-sets"],
      successMessage: t("admin.finance.commission.setPublished"),
    },
  );
  const remove = useAdminMutation(
    (id: string) => adminApi.deleteCommissionRule(id),
    {
      invalidates: ["commission-rules", "commission-rule-sets"],
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
      syncUrl
    >
      <ResourceList.Header
        title={t("admin.finance.commission.title")}
        description={t("admin.finance.commission.subtitle")}
        actions={
          <div className="flex gap-2">
            {!draft && canEdit ? (
              <Button
                leftIcon={<PlusIcon className="h-5 w-5" />}
                onClick={() => createDraft.mutate(undefined)}
                disabled={createDraft.isPending}
              >
                {t("admin.finance.commission.createDraft")}
              </Button>
            ) : draft && canEdit ? (
              <>
                <Button
                  variant="secondary"
                  leftIcon={<PlusIcon className="h-5 w-5" />}
                  onClick={() => setModal({ mode: "create" })}
                >
                  {t("admin.finance.commission.newRule")}
                </Button>
                <Button
                  disabled={!validationQuery.data?.valid || publish.isPending}
                  onClick={() => publish.mutate(draft.id)}
                >
                  {t("admin.finance.commission.publishDraft")}
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <CommissionSummary />
      <RuleResolver draft={draft} />
      <ResourceList.Toolbar>
        <ResourceList.Search />
      </ResourceList.Toolbar>
      <CommissionRuleDeepLink onOpen={openRule} />
      <CommissionRulesContent
        editable={Boolean(draft) && canEdit}
        validation={validationQuery.data}
        onEdit={(rule) => setModal({ mode: "edit", rule })}
        onDelete={onDelete}
      />
      <ResourceList.Pagination />

      {modal?.mode === "view" && (
        <CommissionRuleDetailModal
          rule={modal.rule}
          onClose={() => setModal(null)}
        />
      )}

      {modal && modal.mode !== "view" && draft && canEdit && (
        <CommissionRuleFormModal
          key={modal.mode === "edit" ? modal.rule.id : "new"}
          open
          onClose={() => setModal(null)}
          rule={modal.mode === "edit" ? modal.rule : undefined}
        />
      )}
    </ResourceList>
  );
}
