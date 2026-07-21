/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type UserRating, reviewStatusOptions } from "../_lib/types";
import { sellerReviewColumns } from "../_lib/columns";
import { useReviewAction } from "./useReviewAction";
import { useTranslations } from "next-intl";

export function SellerReviewsTab() {
  const t = useTranslations();
  const { act, isPending, variables } = useReviewAction(
    "user-ratings",
    (id, status) => adminApi.updateUserRatingStatus(id, status),
    t("admin.accounts.reviews.sellerReview"),
  );

  const columns = sellerReviewColumns(
    act,
    t,
    isPending ? variables?.id : undefined,
  );

  return (
    <ResourceList<UserRating>
      resource="user-ratings"
      fetcher={(p) => adminApi.getUserRatings(p)}
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
        emptyText={t("admin.accounts.reviews.sellerEmpty")}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
