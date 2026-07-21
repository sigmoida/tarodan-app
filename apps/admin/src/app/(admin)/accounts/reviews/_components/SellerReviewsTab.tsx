/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type UserRating, reviewStatusOptions } from "../_lib/types";
import { sellerReviewColumns } from "../_lib/columns";
import { useReviewAction } from "./useReviewAction";

export function SellerReviewsTab() {
  const { act, isPending, variables } = useReviewAction(
    "user-ratings",
    (id, status) => adminApi.updateUserRatingStatus(id, status),
    "Satıcı yorumu",
  );

  const columns = sellerReviewColumns(
    act,
    isPending ? variables?.id : undefined,
  );

  return (
    <ResourceList<UserRating>
      resource="user-ratings"
      fetcher={(p) => adminApi.getUserRatings(p)}
      getRowId={(r) => r.id}
      syncUrl
      initialFilters={{ status: "all" }}
    >
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="status"
          options={reviewStatusOptions}
          className="sm:w-48"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText="Satıcı yorumu bulunamadı"
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
