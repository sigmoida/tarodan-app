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
import type { CarModel } from "./_lib/types";
import { carModelColumns } from "./_lib/columns";
import { carModelFilterFields } from "./_lib/filters";
import { useBrandOptions, toSelectOptions } from "@/hooks/useBrandOptions";
import { CarModelFormModal } from "./_modals/CarModelFormModal";

export default function CarModelsPage() {
  const t = useTranslations();
  const confirm = useConfirm();
  const brands = useBrandOptions();
  const [modal, setModal] = useState<{ model?: CarModel } | null>(null);

  const del = useAdminMutation((id: string) => adminApi.deleteCarModel(id), {
    invalidates: ["car-models", "brands"],
    successMessage: t("admin.catalog.carModels.deleted"),
  });
  const toggle = useAdminMutation(
    (m: CarModel) => adminApi.updateCarModel(m.id, { isActive: !m.isActive }),
    {
      invalidates: ["car-models", "brands"],
      optimistic: {
        resources: ["car-models", "brands"],
        id: (m) => m.id,
        patch: (m) => ({ isActive: !m.isActive }),
      },
    },
  );

  const onDelete = useCallback(
    async (m: CarModel) => {
      await confirm({
        title: t("admin.catalog.carModels.deleteTitle"),
        description: t("admin.catalog.carModels.deleteDescription"),
        destructive: true,
        onConfirm: () => del.mutateAsync(m.id),
      });
    },
    [confirm, del, t],
  );

  const columns = useMemo(
    () =>
      carModelColumns(t, {
        onEdit: (m) => setModal({ model: m }),
        onDelete,
        onToggle: (m) => toggle.mutate(m),
        busyId: toggle.isPending ? (toggle.variables?.id ?? null) : null,
      }),
    [t, onDelete, toggle],
  );

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.catalog.carModels.title")}
        description={t("admin.catalog.carModels.subtitle")}
      >
        <Button
          variant="primary"
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setModal({})}
        >
          {t("admin.catalog.carModels.new")}
        </Button>
      </PageHeader>

      <ResourceList<CarModel>
        resource="car-models"
        fetcher={(params) => adminApi.getCarModels(params)}
        getRowId={(m) => m.id}
        syncUrl
        filters={carModelFilterFields(
          t,
          toSelectOptions(brands, t("admin.catalog.carModels.allBrandsFilter")),
        )}
      >
        <ResourceList.Toolbar />
        <ResourceList.Table
          columns={columns}
          emptyText={t("admin.catalog.carModels.emptyForBrand")}
        />
        <ResourceList.Pagination />
      </ResourceList>

      {modal && (
        <CarModelFormModal
          key={modal.model?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          model={modal.model}
        />
      )}
    </AdminPage>
  );
}
