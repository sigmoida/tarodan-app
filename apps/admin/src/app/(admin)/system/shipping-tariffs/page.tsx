"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { TariffFormModal } from "./_modals/TariffFormModal";
import {
  type ShippingTariff,
  type ShippingTariffStatus,
  STATUS_VARIANT,
} from "./_lib/types";

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

  const tariffs = query.data ?? [];

  const statusLabel = (s: ShippingTariffStatus) =>
    s === "active"
      ? t("admin.shippingTariffs.statusActive")
      : s === "draft"
        ? t("admin.shippingTariffs.statusDraft")
        : t("admin.shippingTariffs.statusArchived");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">
            {t("admin.shippingTariffs.title")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("admin.shippingTariffs.description")}
          </p>
        </div>
        <Button onClick={() => setModal({})}>
          {t("admin.shippingTariffs.new")}
        </Button>
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
            <SectionCard key={tariff.id}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-semibold text-heading">
                  {tariff.name}
                </span>
                <Badge variant={STATUS_VARIANT[tariff.status]} size="sm">
                  {statusLabel(tariff.status)}
                </Badge>
              </div>
              <dl className="space-y-1 text-sm text-body">
                <Row
                  label={t("admin.shippingTariffs.providerVersion")}
                  value={`${tariff.provider} · v${tariff.version}`}
                />
                <Row
                  label={t("admin.shippingTariffs.packageFee")}
                  value={fmtTry(Number(tariff.outboundPackageFee))}
                />
                <Row
                  label={t("admin.shippingTariffs.freeShipping")}
                  value={
                    tariff.freeShippingEnabled
                      ? t("admin.shippingTariffs.freeOver", {
                          amount: fmtTry(Number(tariff.freeShippingThreshold)),
                        })
                      : t("admin.shippingTariffs.freeDisabled")
                  }
                />
                <Row
                  label={t("admin.shippingTariffs.returnTrade")}
                  value={`${fmtTry(Number(tariff.returnPackageFee))} · ${fmtTry(Number(tariff.tradeLegFee))}`}
                />
              </dl>
              {tariff.status === "draft" && (
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setModal({ tariff })}
                  >
                    {t("admin.shippingTariffs.edit")}
                  </Button>
                  <Button
                    size="sm"
                    isLoading={
                      activate.isPending && activate.variables === tariff.id
                    }
                    onClick={() => activate.mutate(tariff.id)}
                  >
                    {t("admin.shippingTariffs.activate")}
                  </Button>
                </div>
              )}
            </SectionCard>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-body">{value}</dd>
    </div>
  );
}
