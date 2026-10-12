/** @format */

"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type Review } from "../_lib/types";
import { productReviewColumns } from "../_lib/columns";
import { reviewFilterFields } from "../_lib/filters";
import { useReviewAction } from "./useReviewAction";
import { ReviewDetailDrawer } from "./ReviewDetailDrawer";
import { toProductReviewDetail } from "../_lib/detail";
import { useTranslations } from "next-intl";

export function ProductReviewsTab() {
  const t = useTranslations();
  const { act, isPending, variables } = useReviewAction(
    "reviews",
    (id, status) => adminApi.updateReviewStatus(id, status),
    t("admin.accounts.reviews.productReview"),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const busyId = isPending ? variables?.id : undefined;

  const columns = productReviewColumns(act, t, busyId, setSelectedId);

  return (
    <ResourceList<Review>
      resource="reviews"
      fetcher={(params) => adminApi.getReviews(params)}
      getRowId={(r) => r.id}
      syncUrl
      filters={reviewFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={columns}
        onRowClick={(r) => setSelectedId(r.id)}
        emptyText={t("admin.accounts.reviews.productEmpty")}
      />
      <ResourceList.Pagination />
      <ReviewDetailDrawer<Review>
        selectedId={selectedId}
        toDetail={toProductReviewDetail}
        onAct={act}
        busyId={busyId}
        onClose={() => setSelectedId(null)}
      />
    </ResourceList>
  );
}
