/** @format */

"use client";

import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { SummaryTab } from "./_components/SummaryTab";
import { LinesTab } from "./_components/LinesTab";
import { SettlementsTab } from "./_components/SettlementsTab";

/**
 * PayTR Mutabakat — PSP raporları ↔ bizim kayıtlar. Üç sekme:
 * gün kartları (fark özetleri) · döküm satırları (iş listesi) · hakedişler.
 * Veri, gece rapor sync'inin doldurduğu yerel tablolardan gelir; bu sayfa
 * PayTR'ye canlı istek attırmaz.
 */
export default function PspReconciliationPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("summary");

  const tabs = [
    {
      key: "summary",
      label: t("admin.finance.psp.tabs.summary"),
      icon: ArrowsRightLeftIcon,
    },
    {
      key: "lines",
      label: t("admin.finance.psp.tabs.lines"),
      icon: ListBulletIcon,
    },
    {
      key: "settlements",
      label: t("admin.finance.psp.tabs.settlements"),
      icon: BanknotesIcon,
    },
  ];

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.psp.title")}
        description={t("admin.finance.psp.subtitle")}
      />

      <AdminTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "lines" ? (
        <LinesTab />
      ) : tab === "settlements" ? (
        <SettlementsTab />
      ) : (
        <SummaryTab />
      )}
    </AdminPage>
  );
}
