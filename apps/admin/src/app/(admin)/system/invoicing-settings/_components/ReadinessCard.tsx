"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import type { InvoicingSettingsState } from "@/lib/api/invoicing-settings.types";
import { readinessItems } from "../_lib/invoicing-settings";

/**
 * Hazırlık durumu: Netsis faturası kesilebilmesi için dolu ve geçerli olması
 * gereken ayarlardan hangileri eksik (outline) ya da geçersiz (danger).
 * Sunucudaki durumu gösterir — kaydedilmemiş form değişikliklerini değil.
 */
export function ReadinessCard({ state }: { state: InvoicingSettingsState }) {
  const t = useTranslations();
  const items = readinessItems(state);

  return (
    <SectionCard
      title={t("admin.invoicingSettings.groups.readiness")}
      actions={
        <Badge variant={state.readiness.ready ? "success" : "danger"}>
          {t(
            state.readiness.ready
              ? "admin.invoicingSettings.readiness.ready"
              : "admin.invoicingSettings.readiness.notReady",
          )}
        </Badge>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">
          {t("admin.invoicingSettings.readiness.allSet")}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {t("admin.invoicingSettings.readiness.blocking")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {items.map((item) => (
              <li key={item.key}>
                <Badge variant={item.status === "invalid" ? "danger" : "outline"}>
                  {t(item.labelKey)}
                  {" · "}
                  {t(`admin.invoicingSettings.readiness.${item.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
