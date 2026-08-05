"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Alert, Button, Input, Select } from "@tarodan/ui";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { clientListFetcher } from "@/lib/query/client-list";
import { ResourceList } from "@/components/list";
import { AdminTabs } from "@/components/AdminTabs";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { useTabParam } from "@/hooks/useTabParam";
import { useSession } from "@/context/SessionContext";
import { CommissionSummary } from "./_components/CommissionSummary";
import { CommissionTable } from "./_components/CommissionTable";
import { CommissionRuleDeepLink } from "./_components/CommissionRuleDeepLink";
import { RuleResolutionPreview } from "./_components/RuleResolutionPreview";
import { CommissionRuleFormModal } from "./_modals/CommissionRuleFormModal";
import { CommissionRuleDetailModal } from "./_modals/CommissionRuleDetailModal";
import {
  sellerTypes,
  type CommissionCoverageValidation,
  type CommissionRule,
  type CommissionRulePreview,
  type CommissionRuleSet,
  type SellerType,
} from "./_lib/types";

function RuleResolver({ ruleSet }: { ruleSet: CommissionRuleSet }) {
  const t = useTranslations();
  const { data: categories = [] } = useCategories();
  const [categoryId, setCategoryId] = useState("");
  const defaultCategoryResolved = useRef(false);
  const [sellerType, setSellerType] = useState<SellerType>("FREE");
  const [amount, setAmount] = useState("1000");

  useEffect(() => {
    if (defaultCategoryResolved.current || categories.length === 0) return;
    defaultCategoryResolved.current = true;
    const carCategory = categories.find(
      (category) =>
        category.slug === "araba" ||
        category.name.trim().toLocaleLowerCase("tr-TR") === "araba",
    );
    if (carCategory) setCategoryId(carCategory.id);
  }, [categories]);

  const preview = useMutation<CommissionRulePreview>({
    mutationFn: async () =>
      (
        await adminApi.previewCommissionRule({
          ruleSetId: ruleSet.id,
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
            set:
              ruleSet.status === "DRAFT"
                ? t("admin.finance.commission.draftVersion", {
                    version: ruleSet.version,
                  })
                : t("admin.finance.commission.activeVersion", {
                    version: ruleSet.version,
                  }),
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
        <RuleResolutionPreview
          preview={preview.data}
          categoryName={
            categories.find((category) => category.id === categoryId)?.name ??
            categoryId
          }
        />
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
  ruleSet,
  validation,
  onView,
  onEdit,
  onDelete,
}: {
  editable: boolean;
  ruleSet: CommissionRuleSet;
  validation?: CommissionCoverageValidation;
  onView: (rule: CommissionRule) => void;
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
}) {
  const t = useTranslations();
  const isDraft = ruleSet.status === "DRAFT";
  return (
    <>
      <Alert
        variant={isDraft ? "warning" : "success"}
        title={
          isDraft
            ? t("admin.finance.commission.draftRulesTitle", {
                version: ruleSet.version,
              })
            : t("admin.finance.commission.activeRulesTitle", {
                version: ruleSet.version,
              })
        }
      >
        {isDraft
          ? t("admin.finance.commission.draftEditingDescription")
          : t("admin.finance.commission.activeRulesDescription")}
      </Alert>
      {isDraft && validation && !validation.valid && (
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
      {isDraft && validation?.valid && (
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
        onView={onView}
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
  const [tab, setTab] = useTabParam("active");
  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; rule: CommissionRule }
    | { mode: "view"; rule: CommissionRule; historical?: boolean }
    | null
  >(null);
  const openRule = useCallback(
    (rule: CommissionRule) =>
      setModal({ mode: "view", rule, historical: true }),
    [],
  );

  const setsQuery = useQuery<CommissionRuleSet[]>({
    queryKey: adminKeys.all("commission-rule-sets"),
    queryFn: async () =>
      extractList<CommissionRuleSet>(
        (await adminApi.getCommissionRuleSets()).data,
      ),
  });
  const activeSet = setsQuery.data?.find((set) => set.status === "ACTIVE");
  const draft = setsQuery.data?.find((set) => set.status === "DRAFT");
  const selectedTab = tab === "draft" && draft ? "draft" : "active";
  const selectedSet = selectedTab === "draft" ? draft : activeSet;
  const commissionRulesFetcher = useMemo(
    () =>
      clientListFetcher<CommissionRule>(
        () => adminApi.getCommissionRules(selectedSet?.id),
        (raw) => extractList<CommissionRule>(raw),
      ),
    [selectedSet?.id],
  );

  useEffect(() => {
    if (setsQuery.isSuccess && tab === "draft" && !draft) setTab("active");
  }, [draft, setsQuery.isSuccess, setTab, tab]);

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
      invalidates: [
        "commission-rules-active",
        "commission-rules-draft",
        "commission-rule-sets",
      ],
      successMessage: t("admin.finance.commission.draftCreated"),
    },
  );
  const publish = useAdminMutation(
    (id: string) => adminApi.publishCommissionRuleSet(id),
    {
      invalidates: [
        "commission-rules-active",
        "commission-rules-draft",
        "commission-rule-sets",
      ],
      successMessage: t("admin.finance.commission.setPublished"),
    },
  );
  const remove = useAdminMutation(
    (id: string) => adminApi.deleteCommissionRule(id),
    {
      invalidates: ["commission-rules-draft", "commission-rule-sets"],
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

  const onStartChanges = async () => {
    await createDraft.mutateAsync(undefined);
    await setsQuery.refetch();
    setTab("draft");
  };

  const onPublish = async () => {
    if (!draft) return;
    await publish.mutateAsync(draft.id);
    await setsQuery.refetch();
    setTab("active");
  };

  const onTabChange = (nextTab: string) => {
    setModal(null);
    setTab(nextTab);
  };

  if (!selectedSet) {
    return <div className="p-6 text-sm text-muted">{t("common.loading")}</div>;
  }

  const tabs = [
    {
      key: "active",
      label: t("admin.finance.commission.activeRulesTab"),
      badge: activeSet ? `v${activeSet.version}` : undefined,
    },
    ...(draft
      ? [
          {
            key: "draft",
            label: t("admin.finance.commission.draftChangesTab"),
            badge: `v${draft.version}`,
          },
        ]
      : []),
  ];

  return (
    <ResourceList<CommissionRule>
      key={selectedSet.id}
      resource={`commission-rules-${selectedTab}`}
      fetcher={commissionRulesFetcher}
      getRowId={(rule) => rule.id}
      syncUrl
    >
      <ResourceList.Header
        title={t("admin.finance.commission.title")}
        description={t("admin.finance.commission.subtitle")}
        actions={
          <div className="flex gap-2">
            {selectedTab === "active" && !draft && canEdit ? (
              <Button
                leftIcon={<PencilSquareIcon className="h-5 w-5" />}
                onClick={() => void onStartChanges()}
                disabled={createDraft.isPending}
              >
                {t("admin.finance.commission.changeRules")}
              </Button>
            ) : selectedTab === "active" && draft && canEdit ? (
              <Button variant="secondary" onClick={() => onTabChange("draft")}>
                {t("admin.finance.commission.goToDraft")}
              </Button>
            ) : selectedTab === "draft" && draft && canEdit ? (
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
                  onClick={() => void onPublish()}
                >
                  {t("admin.finance.commission.publishDraft")}
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <CommissionSummary />
      <RuleResolver key={selectedSet.id} ruleSet={selectedSet} />
      <ResourceList.Toolbar>
        <ResourceList.Search />
      </ResourceList.Toolbar>
      <CommissionRuleDeepLink onOpen={openRule} />
      <AdminTabs tabs={tabs} value={selectedTab} onChange={onTabChange} />
      <CommissionRulesContent
        editable={selectedTab === "draft" && canEdit}
        ruleSet={selectedSet}
        validation={selectedTab === "draft" ? validationQuery.data : undefined}
        onView={(rule) => setModal({ mode: "view", rule })}
        onEdit={(rule) => setModal({ mode: "edit", rule })}
        onDelete={onDelete}
      />
      <ResourceList.Pagination />

      {modal?.mode === "view" && (
        <CommissionRuleDetailModal
          rule={modal.rule}
          historical={modal.historical}
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
