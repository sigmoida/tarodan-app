"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { invoiceTabs } from "./_lib/types";
import { ElogoInvoicesTab } from "./_components/ElogoInvoicesTab";
import { SellerInvoicesTab } from "./_components/SellerInvoicesTab";
import { InvoicesSummary } from "./_components/InvoicesSummary";
import { useTranslations } from "next-intl";

export default function InvoicesPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("elogo");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.invoices.title")}
        description={t("admin.finance.invoices.subtitle")}
      />
      <InvoicesSummary />
      <AdminTabs tabs={invoiceTabs(t)} value={tab} onChange={setTab} />

      {tab === "seller" ? <SellerInvoicesTab /> : <ElogoInvoicesTab />}
    </AdminPage>
  );
}
