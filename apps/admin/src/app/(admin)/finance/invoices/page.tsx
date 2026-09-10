"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { CORPORATE_TAB, invoiceTabs, normalizeInvoiceTab } from "./_lib/types";
import { ElogoInvoicesTab } from "./_components/ElogoInvoicesTab";
import { CorporateInvoicesTab } from "./_components/CorporateInvoicesTab";
import { InvoicesSummary } from "./_components/InvoicesSummary";
import { useTranslations } from "next-intl";

export default function InvoicesPage() {
  const t = useTranslations();
  const [rawTab, setTab] = useTabParam("all");
  const tab = normalizeInvoiceTab(rawTab);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.invoices.title")}
        description={t("admin.finance.invoices.subtitle")}
      />
      <InvoicesSummary />
      <AdminTabs tabs={invoiceTabs(t)} value={tab} onChange={setTab} />

      {tab === CORPORATE_TAB ? (
        <CorporateInvoicesTab />
      ) : (
        <ElogoInvoicesTab scope={tab} />
      )}
    </AdminPage>
  );
}
