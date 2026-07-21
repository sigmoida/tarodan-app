"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { reviewTabs } from "./_lib/types";
import { ProductReviewsTab } from "./_components/ProductReviewsTab";
import { SellerReviewsTab } from "./_components/SellerReviewsTab";
import { useTranslations } from "next-intl";

export default function ReviewsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("product");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.accounts.reviews.title")}
        description={t("admin.accounts.reviews.description")}
      />
      <AdminTabs tabs={reviewTabs(t)} value={tab} onChange={setTab} />

      {tab === "seller" ? <SellerReviewsTab /> : <ProductReviewsTab />}
    </AdminPage>
  );
}
