/** @format */

"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { usePrompt } from "@/provider/PromptProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { applicationColumns } from "../_lib/columns";
import { applicationRowMenu } from "../_lib/rowActions";
import { type Application } from "../_lib/types";
import { ApplicationDetail } from "./ApplicationDetail";
import { useTranslations } from "next-intl";

/** The applications list for one status tab — expandable rows + approve/reject. */
export function ApplicationsList({ status }: { status: string }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const approve = useAdminMutation(
    (id: string) => adminApi.approveSellerApplication(id),
    {
      invalidates: ["seller-applications"],
      successMessage: t("admin.accounts.sellerApplications.approveSuccess"),
      errorMessage: t("admin.accounts.sellerApplications.approveError"),
      onSuccess: () => setExpandedId(null),
    },
  );
  const reject = useAdminMutation(
    (v: { id: string; reason: string }) =>
      adminApi.rejectSellerApplication(v.id, v.reason),
    {
      invalidates: ["seller-applications"],
      successMessage: t("admin.accounts.sellerApplications.rejectSuccess"),
      errorMessage: t("admin.accounts.sellerApplications.rejectError"),
      onSuccess: () => setExpandedId(null),
    },
  );

  const onApprove = async (app: Application) => {
    await confirm({
      description: t("admin.accounts.sellerApplications.approveConfirm", {
        company: app.companyTitle,
      }),
      confirmLabel: t("common.confirm"),
      onConfirm: () => approve.mutateAsync(app.id),
    });
  };

  const onReject = async (app: Application) => {
    const reason = await prompt({
      title: t("admin.accounts.sellerApplications.rejectTitle"),
      description: t("admin.accounts.sellerApplications.rejectPrompt"),
      placeholder: t("admin.accounts.sellerApplications.rejectPlaceholder"),
    });
    if (reason === null) return;
    reject.mutate({ id: app.id, reason });
  };

  const columns = applicationColumns(
    applicationRowMenu(
      {
        expandedId,
        onToggleExpand: (a) =>
          setExpandedId((prev) => (prev === a.id ? null : a.id)),
        onApprove,
        onReject,
        busyId: approve.isPending
          ? approve.variables
          : reject.isPending
            ? reject.variables?.id
            : undefined,
      },
      t,
    ),
    t,
  );

  const renderExpanded = (app: Application) => <ApplicationDetail app={app} />;

  return (
    <ResourceList<Application>
      resource="seller-applications"
      fetcher={(params) => adminApi.getSellerApplications(params)}
      getRowId={(a) => a.id}
      syncUrl
      initialFilters={{ status }}
    >
      {/* `status` comes from the tab bar, so this list has no filter dialog. */}
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={columns}
        emptyText={t("admin.accounts.sellerApplications.empty")}
        expandedId={expandedId}
        renderExpanded={renderExpanded}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
