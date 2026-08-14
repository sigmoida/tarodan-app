"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button, Spinner } from "@tarodan/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { StatusToggle } from "@/components/ActiveBadge";
import { ActionIconButton } from "@/components/AdminList";
import { CarModelFormModal } from "../../car-models/_modals/CarModelFormModal";
import type { CarModel } from "../../car-models/_lib/types";
import type { Brand } from "../_lib/types";

/** Expandable car-models panel under a brand row — reuses the shared CarModelFormModal. */
export function BrandModelsPanel({ brand }: { brand: Brand }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ model?: CarModel } | null>(null);

  const { data: models = [], isLoading } = useQuery<CarModel[]>({
    queryKey: adminKeys.list("car-models", { brandId: brand.id }),
    queryFn: async () =>
      (await adminApi.getCarModels({ brandId: brand.id, limit: 100 })).data
        ?.data ?? [],
  });

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

  const onDelete = async (m: CarModel) => {
    await confirm({
      title: t("admin.catalog.carModels.deleteTitle"),
      description: t("admin.catalog.carModels.deleteDescription"),
      destructive: true,
      onConfirm: () => del.mutateAsync(m.id),
    });
  };

  return (
    <div className="border-t border-border bg-surface-alt/40 px-4 py-4 sm:px-6">
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner size="sm" /> {t("admin.catalog.carModels.loading")}
        </div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <TruckIcon className="h-8 w-8 text-subtle" />
          <p className="text-muted">
            {t("admin.catalog.carModels.emptyForBrand")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => setModal({})}
          >
            {t("admin.catalog.carModels.add")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-body">
              {t("admin.catalog.carModels.brandModels", {
                name: brand.name,
                count: models.length,
              })}
            </span>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<PlusIcon className="h-4 w-4" />}
              onClick={() => setModal({})}
            >
              {t("admin.catalog.carModels.add")}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-heading">{m.name}</p>
                  <p className="truncate text-xs text-muted">{m.slug}</p>
                  <p className="mt-1 text-xs text-muted">
                    {m.yearStart || m.yearEnd
                      ? `${m.yearStart ?? "?"} - ${m.yearEnd ?? "?"}`
                      : t("admin.catalog.carModels.noYear")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusToggle
                    active={m.isActive}
                    onToggle={() => toggle.mutate(m)}
                    busy={toggle.isPending && toggle.variables?.id === m.id}
                  />
                  <div className="flex items-center gap-1">
                    <ActionIconButton
                      icon={PencilIcon}
                      onClick={() => setModal({ model: m })}
                      title={t("common.edit")}
                    />
                    <ActionIconButton
                      icon={TrashIcon}
                      onClick={() => onDelete(m)}
                      title={t("common.delete")}
                      variant="danger"
                      isLoading={del.isPending && del.variables === m.id}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <CarModelFormModal
          key={modal.model?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          model={modal.model}
          defaultBrandId={brand.id}
          lockBrand
        />
      )}
    </div>
  );
}
