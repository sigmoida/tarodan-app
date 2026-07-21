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
import type { Category } from "./_lib/types";
import { categoryColumns } from "./_lib/columns";
import { CategoryFormModal } from "./_modals/CategoryFormModal";

export default function CategoriesPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ category?: Category } | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteCategory(id), {
    invalidates: ["categories"],
    successMessage: t("admin.catalog.categories.deleted"),
  });

  const onDelete = useCallback(
    async (c: Category) => {
      await confirm({
        title: t("admin.catalog.categories.deleteTitle"),
        description: t("admin.catalog.categories.deleteDescription"),
        destructive: true,
        onConfirm: () => del.mutateAsync(c.id),
      });
    },
    [confirm, del, t],
  );

  const columns = useMemo(
    () =>
      categoryColumns(t, {
        onEdit: (c) => setModal({ category: c }),
        onDelete,
      }),
    [t, onDelete],
  );

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.catalog.categories.title")}
        description={t("admin.catalog.categories.subtitle")}
      >
        <Button
          variant="primary"
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.catalog.categories.new")}
        </Button>
      </PageHeader>

      <ResourceList<Category>
        resource="categories"
        fetcher={(params) => adminApi.getCategories(params)}
        getRowId={(c) => c.id}
        syncUrl
        initialFilters={{ startDate: "", endDate: "" }}
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.DateRange />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={columns}
          emptyText={t("admin.catalog.categories.empty")}
        />
        <ResourceList.Total unit={t("admin.catalog.categories.unit")} />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <CategoryFormModal
          key={modal.category?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          category={modal.category}
        />
      )}
    </AdminPage>
  );
}
