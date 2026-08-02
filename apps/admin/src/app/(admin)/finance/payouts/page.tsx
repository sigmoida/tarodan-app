"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { payoutTabs } from "./_lib/types";
import { PayoutsSummary } from "./_components/PayoutsSummary";
import { PayoutsExport } from "./_components/PayoutsExport";
import { TransactionsTab } from "./_components/TransactionsTab";
import { TransfersTab } from "./_components/TransfersTab";
import { AdjustmentsTab } from "./_components/AdjustmentsTab";
import { ScheduleTab } from "./_components/ScheduleTab";
import { useTranslations } from "next-intl";

export default function PayoutsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("escrow");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.payouts.title")}
        description={t("admin.finance.payouts.subtitle")}
      >
        <PayoutsExport />
      </PageHeader>

      <PayoutsSummary />

      <AdminTabs tabs={payoutTabs(t)} value={tab} onChange={setTab} />

      {tab === "transfers" ? (
        <TransfersTab />
      ) : tab === "adjustments" ? (
        <AdjustmentsTab />
      ) : tab === "schedule" ? (
        <ScheduleTab />
      ) : (
        <TransactionsTab />
      )}
    </AdminPage>
  );
}
