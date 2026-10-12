"use client";

import { useTranslations } from "next-intl";
import { Alert, Badge, Button } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { invoiceProviderLabels } from "@/app/(admin)/finance/invoices/_lib/types";
import type {
  InvoicingSettingsState,
  NetsisPingResult,
} from "@/lib/api/invoicing-settings.types";

/**
 * Sağlayıcı kartı (salt okunur): etkin sağlayıcı (`INVOICE_PROVIDER`), Netsis'in
 * açık/kapalı ve stub/canlı durumu — hepsi dağıtım ayarıdır, buradan
 * değiştirilmez. Bağlantı testi Netsis'e gerçekten ulaşır; sonuç kartta kalır.
 */
export function ProviderCard({
  state,
  onPing,
  isPinging,
  pingResult,
}: {
  state: InvoicingSettingsState;
  onPing: () => void;
  isPinging: boolean;
  pingResult: NetsisPingResult | null;
}) {
  const t = useTranslations();
  const providers = invoiceProviderLabels(t);

  return (
    <SectionCard
      title={t("admin.invoicingSettings.groups.provider")}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPing}
          isLoading={isPinging}
        >
          {t("admin.invoicingSettings.ping.button")}
        </Button>
      }
    >
      <DataList>
        <Field label={t("admin.invoicingSettings.provider.active")}>
          <Badge variant="default">{providers[state.provider]}</Badge>
        </Field>
        <Field label={t("admin.invoicingSettings.provider.netsisEnabled")}>
          <Badge variant={state.netsisEnabled ? "success" : "outline"}>
            {t(
              state.netsisEnabled
                ? "admin.invoicingSettings.provider.on"
                : "admin.invoicingSettings.provider.off",
            )}
          </Badge>
        </Field>
        <Field label={t("admin.invoicingSettings.provider.netsisMode")}>
          <Badge variant={state.netsisMode === "live" ? "success" : "warning"}>
            {t(`admin.invoicingSettings.mode.${state.netsisMode}`)}
          </Badge>
        </Field>
      </DataList>
      <p className="mt-3 text-xs text-muted">
        {t("admin.invoicingSettings.provider.envNote")}
      </p>

      {pingResult && (
        <Alert
          className="mt-4"
          variant={pingResult.ok ? "success" : "danger"}
        >
          {pingResult.ok
            ? t("admin.invoicingSettings.ping.ok", {
                mode: t(`admin.invoicingSettings.mode.${pingResult.mode}`),
                version: pingResult.version ?? "—",
                auth: t(
                  pingResult.authenticated
                    ? "admin.invoicingSettings.ping.authenticated"
                    : "admin.invoicingSettings.ping.notAuthenticated",
                ),
              })
            : t("admin.invoicingSettings.ping.failed", {
                error: pingResult.error ?? "",
              })}
        </Alert>
      )}
    </SectionCard>
  );
}
