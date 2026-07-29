"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { applicationStatusTabs } from "./_lib/types";
import { ApplicationsList } from "./_components/ApplicationsList";
import { useTranslations } from "next-intl";

export default function SellerApplicationsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("pending");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.accounts.sellerApplications.title")}
        description={t("admin.accounts.sellerApplications.description")}
      />
      <AdminTabs
        tabs={applicationStatusTabs(t)}
        value={tab}
        onChange={setTab}
      />

      {/* key={tab} → remount so `status` seeds initialFilters (read once at mount). */}
      <ApplicationsList key={tab} status={tab} />
    </AdminPage>
  );
}
