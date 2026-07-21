"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { adColumns } from "../_lib/columns";
import { adRowMenu } from "../_lib/rowActions";
import { type Ad } from "../_lib/types";
import { useTranslations } from "next-intl";

export function AdsTable({ onEdit }: { onEdit: (ad: Ad) => void }) {
  const t = useTranslations();
  const confirm = useConfirm();

  const toggle = useAdminMutation(
    (ad: Ad) => adminApi.updateAd(ad.id, { isActive: !ad.isActive }),
    {
      invalidates: ["ads"],
      optimistic: {
        resources: "ads",
        id: (ad) => ad.id,
        patch: (ad) => ({ isActive: !ad.isActive }),
      },
    },
  );
  const del = useAdminMutation((id: string) => adminApi.deleteAd(id), {
    invalidates: ["ads"],
    successMessage: t("admin.marketing.ads.deleted"),
  });

  const onDelete = async (ad: Ad) => {
    await confirm({
      description: t("admin.marketing.ads.deleteConfirm"),
      destructive: true,
      onConfirm: () => del.mutateAsync(ad.id),
    });
  };

  const columns = adColumns(
    {
      onToggle: (ad) => toggle.mutate(ad),
      togglingId: toggle.isPending ? toggle.variables?.id : undefined,
      rowMenu: adRowMenu({ onEdit, onDelete }),
    },
    t,
  );

  return (
    <ResourceList.Table
      columns={columns}
      emptyText={t("admin.marketing.ads.empty")}
    />
  );
}
