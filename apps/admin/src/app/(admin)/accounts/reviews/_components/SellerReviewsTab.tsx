/** @format */

"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type UserRating } from "../_lib/types";
import { sellerReviewColumns } from "../_lib/columns";
import { reviewFilterFields } from "../_lib/filters";
import { useReviewAction } from "./useReviewAction";
import { ReviewDetailDrawer } from "./ReviewDetailDrawer";
import { toSellerReviewDetail } from "../_lib/detail";
import { useTranslations } from "next-intl";

export function SellerReviewsTab() {
  const t = useTranslations();
  const { act, isPending, variables } = useReviewAction(
    "user-ratings",
    (id, status) => adminApi.updateUserRatingStatus(id, status),
    t("admin.accounts.reviews.sellerReview"),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const busyId = isPending ? variables?.id : undefined;

  const columns = sellerReviewColumns(act, t, busyId, setSelectedId);

  return (
    <ResourceList<UserRating>
      resource="user-ratings"
      fetcher={(p) => adminApi.getUserRatings(p)}
      getRowId={(r) => r.id}
      syncUrl
      filters={reviewFilterFields(t)}
    >
      <ResourceList.Toolbar />
      <ResourceList.Table
        columns={columns}
        onRowClick={(r) => setSelectedId(r.id)}
        emptyText={t("admin.accounts.reviews.sellerEmpty")}
      />
      <ResourceList.Pagination />
      <ReviewDetailDrawer<UserRating>
        selectedId={selectedId}
        toDetail={toSellerReviewDetail}
        onAct={act}
        busyId={busyId}
        onClose={() => setSelectedId(null)}
      />
    </ResourceList>
  );
}
