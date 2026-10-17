"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { editDeleteActions, moveActions } from "@/components/table";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useRowReorder } from "@/hooks/useRowReorder";
import { previewText } from "../../hero/_lib/preview";
import { trustBadgeColumns } from "../_lib/columns";
import type { TrustBadge } from "../_lib/types";

export function TrustBadgesTable({
  onEdit,
}: {
  onEdit: (badge: TrustBadge) => void;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const { onMove, positionOf, moving } = useRowReorder<TrustBadge>(
    "trust-badges",
    (ids) => adminApi.reorderTrustBadges(ids),
  );

  const toggle = useAdminMutation(
    (b: TrustBadge) => adminApi.updateTrustBadge(b.id, { isActive: !b.isActive }),
    {
      invalidates: ["trust-badges"],
      optimistic: {
        resources: "trust-badges",
        id: (b) => b.id,
        patch: (b) => ({ isActive: !b.isActive }),
      },
    },
  );
  const del = useAdminMutation((id: string) => adminApi.deleteTrustBadge(id), {
    invalidates: ["trust-badges"],
    successMessage: t("admin.marketing.trustBadges.deleted"),
  });

  const onDelete = async (badge: TrustBadge) => {
    await confirm({
      description: t("admin.marketing.trustBadges.deleteConfirm", {
        title: previewText(badge.title, "tr"),
      }),
      destructive: true,
      onConfirm: () => del.mutateAsync(badge.id),
    });
  };

  const columns = trustBadgeColumns(
    {
      onToggle: (b) => toggle.mutate(b),
      togglingId: toggle.isPending ? toggle.variables?.id : undefined,
      rowMenu: (b) => {
        const [edit, remove] = editDeleteActions(b, { onEdit, onDelete }, t);
        return [
          edit,
          ...moveActions((d) => onMove(b, d), positionOf(b), t, moving),
          remove,
        ];
      },
    },
    t,
  );

  return (
    <ResourceList.Table
      columns={columns}
      emptyText={t("admin.marketing.trustBadges.empty")}
    />
  );
}
