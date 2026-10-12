"use client";

import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import { Badge } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import type { InvoicingSettingsState } from "@/lib/api/invoicing-settings.types";
import {
  readinessItems,
  type ReadinessSection,
} from "../_lib/invoicing-settings";

/** Bloğa özgü metinler; rozet etiketleri iki blokta ortaktır. */
const SECTION_COPY: Record<
  ReadinessSection,
  { heading: MessageKey; allSet: MessageKey; blocking: MessageKey }
> = {
  invoicing: {
    heading: "admin.invoicingSettings.readiness.sections.invoicing",
    allSet: "admin.invoicingSettings.readiness.allSet",
    blocking: "admin.invoicingSettings.readiness.blocking",
  },
  accounting: {
    heading: "admin.invoicingSettings.readiness.sections.accounting",
    allSet: "admin.invoicingSettings.readiness.allSetAccounting",
    blocking: "admin.invoicingSettings.readiness.blockingAccounting",
  },
};

function ReadinessBlock({
  state,
  section,
}: {
  state: InvoicingSettingsState;
  section: ReadinessSection;
}) {
  const t = useTranslations();
  const items = readinessItems(state, section);
  const copy = SECTION_COPY[section];
  const ready = (
    section === "accounting" ? state.accountingReadiness : state.readiness
  ).ready;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-heading">{t(copy.heading)}</h3>
        <Badge variant={ready ? "success" : "danger"}>
          {t(
            ready
              ? "admin.invoicingSettings.readiness.ready"
              : "admin.invoicingSettings.readiness.notReady",
          )}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t(copy.allSet)}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{t(copy.blocking)}</p>
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
    </div>
  );
}

/**
 * Hazırlık durumu: iki blok — "Faturalama" (Netsis faturası kesilebilmesi için
 * eksik outline / geçersiz danger ayarlar) ve "Muhasebe senkronu" (senkron
 * açıkken hesap kodları). Sunucudaki durumu gösterir — kaydedilmemiş form
 * değişikliklerini değil.
 */
export function ReadinessCard({ state }: { state: InvoicingSettingsState }) {
  const t = useTranslations();

  return (
    <SectionCard title={t("admin.invoicingSettings.groups.readiness")}>
      <div className="space-y-6">
        <ReadinessBlock state={state} section="invoicing" />
        <ReadinessBlock state={state} section="accounting" />
      </div>
    </SectionCard>
  );
}
