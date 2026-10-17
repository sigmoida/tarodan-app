"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, Spinner } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
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
    <AdminPage>
      <PageHeader
        title={t("admin.shippingTariffs.title")}
        description={t("admin.shippingTariffs.description")}
      >
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
      </PageHeader>

      {query.isLoading ? (
        <SectionCard>
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        </SectionCard>
      ) : tariffs.length === 0 ? (
        <SectionCard>
          <EmptyState
            size="compact"
            icon={false}
            title={t("admin.shippingTariffs.empty")}
          />
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
    </AdminPage>
  );
}
