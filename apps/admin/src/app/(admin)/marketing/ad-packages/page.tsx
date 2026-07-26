"use client";

import { useState } from "react";
import { Button, Spinner } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useTranslations } from "next-intl";
import { usePackages } from "./_lib/usePackages";
import { type AdPackage } from "./_lib/types";
import { PackageCard } from "./_components/PackageCard";
import { PackageFormModal } from "./_modals/PackageFormModal";

export default function AdPackagesPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const { data: packages, isLoading, isError, refetch } = usePackages();
  const [modal, setModal] = useState<{ pkg?: AdPackage } | null>(null);

  const del = useAdminMutation(
    (id: string) => adminApi.delete(`/admin/ad-packages/${id}`),
    {
      invalidates: ["ad-packages"],
      successMessage: t("admin.marketing.adPackages.deleted"),
      errorMessage: t("admin.marketing.adPackages.deleteFailed"),
    },
  );

  const onDelete = (pkg: AdPackage) =>
    confirm({
      title: t("admin.marketing.adPackages.deleteTitle"),
      description: t("admin.marketing.adPackages.deleteConfirm"),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: () => del.mutateAsync(pkg.id),
    });

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.adPackages.title")}
        description={t("admin.marketing.adPackages.subtitle")}
      >
        <Button
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.marketing.adPackages.newPackage")}
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : isError ? (
        <QueryErrorCard onRetry={refetch} />
      ) : !packages || packages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
          {t("admin.marketing.adPackages.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onEdit={() => setModal({ pkg })}
              onDelete={() => onDelete(pkg)}
            />
          ))}
        </div>
      )}

      {modal && (
        <PackageFormModal
          key={modal.pkg?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          pkg={modal.pkg}
        />
      )}
    </AdminPage>
  );
}
