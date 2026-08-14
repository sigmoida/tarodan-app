"use client";

import { useTranslations } from "next-intl";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { col, type RowActionItem } from "@/components/table";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { usePrompt } from "@/provider/PromptProvider";
import type { CarrierCancellationTaskRow } from "../_lib/types";
import { carrierCancellationFilterFields } from "../_lib/filters";

const statusVariant = {
  pending: "warning",
  resolved: "success",
  dismissed: "secondary",
} as const;

function CarrierCancellationTasksTable() {
  const t = useTranslations();
  const prompt = usePrompt();
  const resolve = useAdminMutation(
    (input: {
      id: string;
      status: "resolved" | "dismissed";
      resolution: string;
    }) =>
      adminApi.resolveCarrierCancellationTask(input.id, {
        status: input.status,
        resolution: input.resolution,
      }),
    {
      invalidates: ["carrier-cancellation-tasks"],
      successMessage: t(
        "admin.operations.shipping.cancellations.updateSuccess",
      ),
    },
  );

  const complete = async (
    task: CarrierCancellationTaskRow,
    status: "resolved" | "dismissed",
  ) => {
    const resolution = await prompt({
      title: t("admin.operations.shipping.cancellations.resolveTitle"),
      description: t(
        "admin.operations.shipping.cancellations.resolveDescription",
        { reference: task.reference },
      ),
      label: t("admin.operations.shipping.cancellations.resolution"),
      confirmLabel:
        status === "resolved"
          ? t("admin.operations.shipping.cancellations.markResolved")
          : t("admin.operations.shipping.cancellations.dismiss"),
      destructive: status === "dismissed",
      maxLength: 1000,
    });
    if (resolution === null) return;
    resolve.mutate({ id: task.id, status, resolution });
  };

  const columns = [
    col.code<CarrierCancellationTaskRow>(
      t("admin.operations.shipping.cancellations.reference"),
      "reference",
      { sortKey: "reference" },
    ),
    col.text<CarrierCancellationTaskRow>(
      t("admin.operations.shipping.cancellations.source"),
      (row) => `${row.entityType} · ${row.entityId}`,
      { minWidth: 220 },
    ),
    col.text<CarrierCancellationTaskRow>(
      t("admin.operations.shipping.cancellations.reason"),
      "reason",
      { wrap: true, minWidth: 220 },
    ),
    col.badge<CarrierCancellationTaskRow>(
      t("common.status"),
      (row) => (
        <Badge variant={statusVariant[row.status]}>
          {t(`admin.operations.shipping.cancellations.status.${row.status}`)}
        </Badge>
      ),
      { sortKey: "status" },
    ),
    col.date<CarrierCancellationTaskRow>(
      t("admin.operations.shipping.cancellations.requestedAt"),
      "requestedAt",
      { sortKey: "requestedAt" },
    ),
    col.text<CarrierCancellationTaskRow>(
      t("admin.operations.shipping.cancellations.resolution"),
      (row) => row.resolution ?? "—",
      { wrap: true, minWidth: 220 },
    ),
    col.date<CarrierCancellationTaskRow>(
      t("admin.operations.shipping.cancellations.resolvedAt"),
      "resolvedAt",
    ),
    col.text<CarrierCancellationTaskRow>(
      t("admin.operations.shipping.cancellations.resolvedBy"),
      (row) =>
        row.resolvedByAdmin
          ? `${row.resolvedByAdmin.displayName} · ${row.resolvedByAdmin.email}`
          : (row.resolvedBy ?? "—"),
      { minWidth: 220 },
    ),
    col.rowMenu<CarrierCancellationTaskRow>((row): RowActionItem[] =>
      row.status !== "pending"
        ? []
        : [
            {
              label: t("admin.operations.shipping.cancellations.markResolved"),
              icon: CheckIcon,
              onClick: () => complete(row, "resolved"),
              isLoading: resolve.isPending && resolve.variables?.id === row.id,
            },
            {
              label: t("admin.operations.shipping.cancellations.dismiss"),
              icon: XMarkIcon,
              onClick: () => complete(row, "dismissed"),
              destructive: true,
              isLoading: resolve.isPending && resolve.variables?.id === row.id,
            },
          ],
    ),
  ];

  return (
    <ResourceList.Table
      columns={columns}
      emptyText={t("admin.operations.shipping.cancellations.empty")}
    />
  );
}

export function CarrierCancellationsTab() {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {t("admin.operations.shipping.cancellations.info")}
      </p>
      <ResourceList<CarrierCancellationTaskRow>
        resource="carrier-cancellation-tasks"
        fetcher={(params) => adminApi.getCarrierCancellationTasks(params)}
        getRowId={(row) => row.id}
        filters={carrierCancellationFilterFields(t)}
        syncUrl
      >
        <ResourceList.Toolbar />
        <CarrierCancellationTasksTable />
        <ResourceList.Pagination />
      </ResourceList>
    </div>
  );
}
