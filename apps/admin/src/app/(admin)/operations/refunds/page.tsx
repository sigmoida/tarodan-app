"use client";

import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { RefundsView } from "./_components/RefundsView";

/**
 * İadeler: iade taleplerinin ekranı. Dört üst sekme (Tüm İadeler / Direk
 * Satış / Teklif / Takas), her birinin altında durum alt sekmeleri ve sayaçları.
 * Eski `/operations/refund-requests` listesi ve "İptal & İade"nin İadeler
 * sekmesi buraya yönlenir; iade DOSYASI yerinde durur.
 */
export default function RefundsPage() {
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.refunds.title")}
        description={t("admin.operations.refunds.description")}
      />
      <RefundsView />
    </AdminPage>
  );
}
