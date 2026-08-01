"use client";

import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { adminApi } from "@/lib/api";

/**
 * Manual Elasticsearch product reindex. Drops + rebuilds the index with the
 * current mapping, so price/boost changes land on existing products. Typically
 * run once after a deploy.
 *
 * Sayfa BAŞLIĞINDA bir eylem butonu olarak durur: ayar formuyla ilgisi olmayan
 * tek seferlik bir bakım işi, kendi kartını hak etmiyordu. Başlıkta olduğu için
 * artık warehouse sekmesinde de erişilebilir (eskiden yalnız numerik sekmelerde
 * render ediliyordu).
 */
export function SearchReindexButton() {
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
    <Button
      type="button"
      variant="secondary"
      leftIcon={<ArrowPathIcon className="h-4 w-4" />}
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
  );
}
