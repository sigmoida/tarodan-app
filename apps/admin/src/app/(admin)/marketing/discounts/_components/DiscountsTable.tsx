"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { discountColumns } from "../_lib/columns";
import { discountRowMenu } from "../_lib/rowActions";
import { type Discount } from "../_lib/types";
import { useTranslations } from "next-intl";

/** Discount table — active/inactive toggle + delete live here as mutations. */
export function DiscountsTable({ onEdit }: { onEdit: (d: Discount) => void }) {
  const t = useTranslations();
  const confirm = useConfirm();

  const toggle = useAdminMutation(
    (d: Discount) =>
      adminApi.patch(`/admin/discounts/${d.id}`, { isActive: !d.isActive }),
    {
      invalidates: ["discounts"],
      successMessage: t("admin.marketing.discounts.statusUpdated"),
      errorMessage: t("admin.marketing.discounts.statusUpdateFailed"),
      optimistic: {
        resources: "discounts",
        id: (d) => d.id,
        patch: (d) => ({ isActive: !d.isActive }),
      },
    },
  );

  const del = useAdminMutation(
    (id: string) => adminApi.delete(`/admin/discounts/${id}`),
    {
      invalidates: ["discounts"],
      successMessage: t("admin.marketing.discounts.deleted"),
      errorMessage: t("admin.marketing.discounts.deleteFailed"),
    },
  );

  const onDelete = async (d: Discount) => {
    await confirm({
      title: t("admin.marketing.discounts.deleteTitle"),
      description: t("admin.marketing.discounts.deleteConfirm"),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: () => del.mutateAsync(d.id),
    });
  };

  const columns = discountColumns(
    discountRowMenu({
      onToggle: (d) => toggle.mutate(d),
      onEdit,
      onDelete,
      busyId: toggle.isPending ? toggle.variables?.id : undefined,
    }),
    t,
  );

  return (
    <ResourceList.Table
      columns={columns}
      emptyText={t("admin.marketing.discounts.empty")}
    />
  );
}
