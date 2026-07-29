/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type Review, reviewStatusOptions } from "../_lib/types";
import { productReviewColumns } from "../_lib/columns";
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
      initialFilters={{ status: "all", startDate: "", endDate: "" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={reviewStatusOptions(t)}
          className="sm:w-48"
        />
        <ResourceList.DateRange />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText={t("admin.accounts.reviews.productEmpty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
