"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { discountColumns } from "../_lib/columns";
import { discountRowMenu } from "../_lib/rowActions";
import { type Discount } from "../_lib/types";

/** Discount table — active/inactive toggle + delete live here as mutations. */
export function DiscountsTable({ onEdit }: { onEdit: (d: Discount) => void }) {
  const confirm = useConfirm();

  const toggle = useAdminMutation(
    (d: Discount) =>
      adminApi.patch(`/admin/discounts/${d.id}`, { isActive: !d.isActive }),
    {
      invalidates: ["discounts"],
      successMessage: "Durum güncellendi",
      errorMessage: "Durum güncellenirken hata oluştu",
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
      successMessage: "İndirim silindi",
      errorMessage: "İndirim silinirken hata oluştu",
    },
  );

  const onDelete = async (d: Discount) => {
    await confirm({
      title: "İndirimi Sil",
      description:
        "Bu indirimi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
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
  );

  return (
    <ResourceList.Table
      columns={columns}
      emptyText="Henüz indirim tanımlanmamış"
    />
  );
}
