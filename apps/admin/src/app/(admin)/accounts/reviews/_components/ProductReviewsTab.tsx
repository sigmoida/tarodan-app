/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type Review, reviewStatusOptions } from "../_lib/types";
import { productReviewColumns } from "../_lib/columns";
import { useReviewAction } from "./useReviewAction";

export function ProductReviewsTab() {
  const { act, isPending, variables } = useReviewAction(
    "reviews",
    (id, status) => adminApi.updateReviewStatus(id, status),
    "Yorum",
  );

  const columns = productReviewColumns(
    act,
    isPending ? variables?.id : undefined,
  );

  return (
    <ResourceList<Review>
      resource="reviews"
      fetcher={(params) => adminApi.getReviews(params)}
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
      <ResourceList.Table columns={columns} emptyText="Yorum bulunamadı" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
