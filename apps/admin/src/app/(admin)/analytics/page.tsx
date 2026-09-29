"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import {
  ANALYTICS_TABS,
  DEFAULT_ANALYTICS_TAB,
  isAnalyticsTab,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { TAB_ICONS, TAB_SECTIONS } from "./_lib/tabConfig";
import { useAnalyticsRange } from "./_lib/useAnalyticsRange";
import { useAnalyticsTab } from "./_lib/useAnalyticsTab";
import { AnalyticsFilters } from "./_components/AnalyticsFilters";
import { AnalyticsExport } from "./_components/AnalyticsExport";

// Charts pull in chart.js; only the active tab renders, so the view is loaded
// lazily rather than shipped with the page bundle.
const AnalyticsTabView = dynamic(
  () =>
    import("./_components/AnalyticsTabView").then((m) => m.AnalyticsTabView),
  { ssr: false },
);

/**
 * **Analizler** — "seçilen dönemde ne oldu ve neden".
 *
 * Anlık durum sayıları (şu an kaç aktif ilan, escrow'da ne kadar para) burada
 * DEĞİL: onlar bir anın fotoğrafı ve Kontrol Paneli'nin işi. Bu ekran yalnız
 * akış gösterir, ve her rakam kendi olay damgasından ölçülür.
 */
export default function AnalyticsPage() {
  const t = useTranslations();
  const [rawTab, setTab] = useTabParam(DEFAULT_ANALYTICS_TAB);
  const [selection, setSelection] = useAnalyticsRange();

  const tab = isAnalyticsTab(rawTab) ? rawTab : DEFAULT_ANALYTICS_TAB;
  const query = useAnalyticsTab(tab, selection);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.analytics.title")}
        description={t("admin.analytics.description")}
      >
        <AnalyticsExport tab={tab} selection={selection} />
      </PageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <AdminTabs
          tabs={ANALYTICS_TABS.map((key) => ({
            key,
            label: t(`admin.analytics.tabs.${key}` as MessageKey),
            icon: TAB_ICONS[key],
          }))}
          value={tab}
          onChange={setTab}
        />
        <AnalyticsFilters selection={selection} onChange={setSelection} />
      </div>

      {query.isError ? (
        <Alert variant="danger">{t("common.requestFailed")}</Alert>
      ) : (
        <AnalyticsTabView
          sections={TAB_SECTIONS[tab]}
          data={query.data ?? null}
          isLoading={query.isLoading}
        />
      )}
    </AdminPage>
  );
}
