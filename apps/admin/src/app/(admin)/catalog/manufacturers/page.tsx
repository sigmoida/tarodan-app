/** @format */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { ArrowUpTrayIcon, PlusIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { CatalogImportModal } from "@/components/catalog/CatalogImportModal";
import type { Manufacturer } from "./_lib/types";
import { manufacturerColumns } from "./_lib/columns";
import { ManufacturerFormModal } from "./_modals/ManufacturerFormModal";

export default function ManufacturersPage() {
  const confirm = useConfirm();
  const t = useTranslations();
  const [modal, setModal] = useState<{ manufacturer?: Manufacturer } | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);

  const del = useAdminMutation(
    (id: string) => adminApi.deleteManufacturer(id),
    {
      invalidates: ["manufacturers"],
      successMessage: t("admin.catalog.manufacturers.deleted"),
    },
  );
  const toggle = useAdminMutation(
    (m: Manufacturer) =>
      adminApi.updateManufacturer(m.id, { isActive: !m.isActive }),
    {
      invalidates: ["manufacturers"],
      optimistic: {
        resources: "manufacturers",
        id: (m) => m.id,
        patch: (m) => ({ isActive: !m.isActive }),
      },
    },
  );

  const onDelete = useCallback(
    async (m: Manufacturer) => {
      await confirm({
        title: t("admin.catalog.manufacturers.deleteTitle"),
        description: t("admin.catalog.manufacturers.deleteDescription"),
        destructive: true,
        onConfirm: () => del.mutateAsync(m.id),
      });
    },
    [confirm, del, t],
  );

  const columns = useMemo(
    () =>
      manufacturerColumns(t, {
        onEdit: (m) => setModal({ manufacturer: m }),
        onDelete,
        onToggle: (m) => toggle.mutate(m),
        busyId: toggle.isPending ? (toggle.variables?.id ?? null) : null,
      }),
    [t, onDelete, toggle],
  );

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.catalog.manufacturers.title")}
        description={t("admin.catalog.manufacturers.subtitle")}
      >
        <Button
          variant="outline"
          leftIcon={<ArrowUpTrayIcon className="h-5 w-5" />}
          onClick={() => setImportOpen(true)}
        >
          {t("admin.catalog.import.button")}
        </Button>
        <Button
          variant="primary"
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.catalog.manufacturers.new")}
        </Button>
      </PageHeader>

      <ResourceList<Manufacturer>
        resource="manufacturers"
        fetcher={(params) => adminApi.getManufacturers(params)}
        getRowId={(m) => m.id}
        syncUrl
      >
        <ResourceList.Toolbar />
        <ResourceList.Table
          columns={columns}
          emptyText={t("admin.catalog.manufacturers.empty")}
        />
        <ResourceList.Pagination />
      </ResourceList>

      {importOpen && (
        <CatalogImportModal
          resource="manufacturers"
          open
          onClose={() => setImportOpen(false)}
        />
      )}

      {modal && (
        <ManufacturerFormModal
          key={modal.manufacturer?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          manufacturer={modal.manufacturer}
        />
      )}
    </AdminPage>
  );
}
