"use client";

import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { adminApi } from "@/lib/api";

/**
 * Manual Elasticsearch product reindex. Drops + rebuilds the index with the
 * current mapping, so price/boost changes land on existing products. Typically
 * run once after a deploy — the endpoint is admin/super_admin only.
 */
export function SearchIndexCard() {
  const t = useTranslations();
  const confirm = useConfirm();

  const reindex = useAdminMutation(
    () => adminApi.reindexSearch().then((r) => r.data as { indexed: number }),
    {
      onSuccess: (data) =>
        toast.success(
          t("admin.settings.search.success", { count: data.indexed }),
        ),
    },
  );

  return (
    <SectionCard title={t("admin.settings.search.title")}>
      <p className="mb-4 text-sm text-muted">
        {t("admin.settings.search.description")}
      </p>
      <Button
        type="button"
        variant="secondary"
        isLoading={reindex.isPending}
        onClick={() =>
          confirm({
            title: t("admin.settings.search.confirmTitle"),
            description: t("admin.settings.search.confirmDescription"),
            confirmLabel: t("admin.settings.search.reindexButton"),
            onConfirm: () => reindex.mutateAsync(),
          })
        }
      >
        {t("admin.settings.search.reindexButton")}
      </Button>
    </SectionCard>
  );
}
