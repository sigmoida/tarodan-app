"use client";

import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { CancellationsView } from "./CancellationsView";

/**
 * İptaller: iptal edilen sepet / teklif siparişi / takasları aktöre göre
 * ayırır. İadeler ayrı ekrandadır (`/operations/refunds`).
 */
export function CancellationsScreen() {
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.cancellations.title")}
        description={t("admin.operations.cancellations.description")}
      />
      <CancellationsView />
    </AdminPage>
  );
}
