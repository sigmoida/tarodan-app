/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type Review } from "../_lib/types";
import { productReviewColumns } from "../_lib/columns";
import { reviewFilterFields } from "../_lib/filters";
import { useReviewAction } from "./useReviewAction";
import { useTranslations } from "next-intl";

export function ProductReviewsTab() {
  const t = useTranslations();
  const { act, isPending, variables } = useReviewAction(
    "reviews",
    (id, status) => adminApi.updateReviewStatus(id, status),
    t("admin.accounts.reviews.productReview"),
  );

  const columns = productReviewColumns(
    act,
    t,
    isPending ? variables?.id : undefined,
  );

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
        emptyText={t("admin.accounts.reviews.productEmpty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
