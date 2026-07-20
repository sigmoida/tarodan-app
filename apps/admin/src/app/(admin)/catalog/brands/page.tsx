/** @format */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type { Brand } from "./_lib/types";
import { brandColumns } from "./_lib/columns";
import { BrandModelsPanel } from "./_components/BrandModelsPanel";
import { BrandFormModal } from "./_modals/BrandFormModal";

export default function BrandsPage() {
  const t = useTranslations();
  const STATUS_OPTIONS = [
    { value: "all", label: t("admin.catalog.brands.allBrands") },
    { value: "active", label: t("common.active") },
    { value: "inactive", label: t("common.inactive") },
  ];
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ brand?: Brand } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteBrand(id), {
    invalidates: ["brands"],
    successMessage: t("admin.catalog.brands.deleted"),
  });
  const toggle = useAdminMutation(
    (b: Brand) => adminApi.updateBrand(b.id, { isActive: !b.isActive }),
    {
      invalidates: ["brands"],
      optimistic: {
        resources: "brands",
        id: (b) => b.id,
        patch: (b) => ({ isActive: !b.isActive }),
      },
    },
  );

  const onDelete = useCallback(
    async (b: Brand) => {
      await confirm({
        title: t("admin.catalog.brands.deleteTitle"),
        description: t("admin.catalog.brands.deleteDescription"),
        destructive: true,
        onConfirm: () => del.mutateAsync(b.id),
      });
    },
    [confirm, del, t],
  );

  const columns = useMemo(
    () =>
      brandColumns(t, {
        onEdit: (b) => setModal({ brand: b }),
        onDelete,
        onToggle: (b) => toggle.mutate(b),
        onToggleExpand: (id) =>
          setExpandedId((prev) => (prev === id ? null : id)),
        expandedId,
        busyId: toggle.isPending ? (toggle.variables?.id ?? null) : null,
      }),
    [t, onDelete, toggle, expandedId],
  );

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.catalog.brands.title")}
        description={t("admin.catalog.brands.subtitle")}
      >
        <Button
          variant="primary"
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.catalog.brands.new")}
        </Button>
      </PageHeader>

      <ResourceList<Brand>
        resource="brands"
        fetcher={(params) => adminApi.getBrands(params)}
        getRowId={(b) => b.id}
        syncUrl
        initialFilters={{ status: "all" }}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.FilterSelect
            name="status"
            options={STATUS_OPTIONS}
            className="sm:w-40"
          />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={columns}
          emptyText={t("admin.catalog.brands.empty")}
          expandedId={expandedId}
          renderExpanded={(b) => <BrandModelsPanel brand={b} />}
        />
        <ResourceList.Total unit={t("admin.catalog.brands.unit")} />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <BrandFormModal
          key={modal.brand?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          brand={modal.brand}
        />
      )}
    </AdminPage>
  );
}
