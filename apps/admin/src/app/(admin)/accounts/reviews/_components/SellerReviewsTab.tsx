/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type UserRating } from "../_lib/types";
import { sellerReviewColumns } from "../_lib/columns";
import { REVIEW_DEEP_LINK_FILTERS, reviewFilterFields } from "../_lib/filters";
import { useReviewModeration } from "@/components/reviews/useReviewModeration";
import { ReviewModerationModal } from "@/components/reviews/ReviewModerationModal";
import { useReviewDeepLink } from "./useReviewDeepLink";
import { ReviewDetailDrawer } from "./ReviewDetailDrawer";
import { toSellerReviewDetail } from "../_lib/detail";
import { useTranslations } from "next-intl";

export function SellerReviewsTab() {
  const t = useTranslations();
  const { request, busyId, modalProps } = useReviewModeration(
    "user-ratings",
    (id, body) => adminApi.updateUserRatingStatus(id, body),
    t("admin.accounts.reviews.sellerReview"),
  );
  const [selectedId, setSelectedId] = useReviewDeepLink();

  const columns = sellerReviewColumns(request, t, busyId, setSelectedId);

  return (
    <ResourceList<UserRating>
      resource="user-ratings"
      fetcher={(p) => adminApi.getUserRatings(p)}
      getRowId={(r) => r.id}
      syncUrl
      filters={reviewFilterFields(t)}
      initialFilters={REVIEW_DEEP_LINK_FILTERS}
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
        onAct={request}
        busyId={busyId}
        onClose={() => setSelectedId(null)}
      />
      <ReviewModerationModal {...modalProps} />
    </ResourceList>
  );
}
