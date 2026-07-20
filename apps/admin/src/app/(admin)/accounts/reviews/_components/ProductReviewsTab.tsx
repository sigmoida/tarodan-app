/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type Review, reviewStatusOptions } from "../_lib/types";
import { productReviewColumns } from "../_lib/columns";
import { useReviewAction } from "./useReviewAction";

export function ProductReviewsTab() {
  const { act } = useReviewAction(
    "reviews",
    (id, status) => adminApi.updateReviewStatus(id, status),
    "Yorum",
  );

  const columns = productReviewColumns(act);

  return (
    <ResourceList<Review>
      resource="reviews"
      fetcher={(params) => {
        const { sortBy, sortOrder, ...rest } = params;
        const preset =
          sortBy === "createdAt"
            ? sortOrder === "desc"
              ? "newest"
              : "oldest"
            : sortBy === "score"
              ? sortOrder === "desc"
                ? "highest_score"
                : "lowest_score"
              : undefined;
        return adminApi.getReviews({ ...rest, sortBy: preset });
      }}
      getRowId={(r) => r.id}
      limit={10}
      syncUrl
      initialFilters={{ status: "all" }}
      errorMessage="Yorumlar yüklenirken hata oluştu"
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
