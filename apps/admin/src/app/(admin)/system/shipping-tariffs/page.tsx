"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { TariffCard } from "./_components/TariffCard";
import { TariffFormModal } from "./_modals/TariffFormModal";
import { type ShippingTariff } from "./_lib/types";

/**
 * Shipping tariffs admin — the typed, versioned replacement for editing shipping
 * pricing via the generic /admin/settings endpoint. Only super_admin can create /
 * activate; activation atomically archives the current active tariff.
 */
export default function ShippingTariffsPage() {
  const t = useTranslations();
  const [modal, setModal] = useState<{ tariff?: ShippingTariff } | null>(null);

  const query = useQuery({
    queryKey: adminKeys.all("shipping-tariffs"),
    queryFn: async () =>
      extractList<ShippingTariff>((await adminApi.getShippingTariffs()).data),
  });

  const activate = useAdminMutation(
    (id: string) => adminApi.activateShippingTariff(id),
    {
      invalidates: ["shipping-tariffs"],
      successMessage: t("admin.shippingTariffs.activated"),
    },
  );

  // Aktif tarife dokunulmazdır (fiyat değişimi yeni sürüm doğurur). Klonlama, üç
  // boyutu ve örnek ölçüleri sıfırdan girme zorunluluğunu kaldırır: kopyala →
  // tutarı değiştir → aktifleştir.
  const clone = useAdminMutation(() => adminApi.cloneActiveShippingTariff(), {
    invalidates: ["shipping-tariffs"],
    successMessage: t("admin.shippingTariffs.cloned"),
  });

  const tariffs = query.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">
            {t("admin.shippingTariffs.title")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {t("admin.shippingTariffs.description")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {tariffs.some((tariff) => tariff.status === "active") && (
            <Button
              variant="secondary"
              isLoading={clone.isPending}
              onClick={() => clone.mutate(undefined)}
            >
              {t("admin.shippingTariffs.cloneActive")}
            </Button>
          )}
          <Button onClick={() => setModal({})}>
            {t("admin.shippingTariffs.new")}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <SectionCard>
          <p className="py-8 text-center text-muted">
            {t("admin.shippingTariffs.loading")}
          </p>
        </SectionCard>
      ) : tariffs.length === 0 ? (
        <SectionCard>
          <p className="py-8 text-center text-muted">
            {t("admin.shippingTariffs.empty")}
          </p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tariffs.map((tariff) => (
            <TariffCard
              key={tariff.id}
              tariff={tariff}
              onEdit={() => setModal({ tariff })}
              onActivate={() => activate.mutate(tariff.id)}
              isActivating={
                activate.isPending && activate.variables === tariff.id
              }
            />
          ))}
        </div>
      )}

      {modal && (
        <TariffFormModal
          key={modal.tariff?.id ?? "new"}
          open
          onClose={() => setModal(null)}
          tariff={modal.tariff}
        />
      )}
    </div>
  );
}
