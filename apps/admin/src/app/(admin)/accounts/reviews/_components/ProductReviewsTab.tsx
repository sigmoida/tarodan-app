/** @format */

"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { type Review } from "../_lib/types";
import { productReviewColumns } from "../_lib/columns";
import { REVIEW_DEEP_LINK_FILTERS, reviewFilterFields } from "../_lib/filters";
import { useReviewModeration } from "@/components/reviews/useReviewModeration";
import { ReviewModerationModal } from "@/components/reviews/ReviewModerationModal";
import { useReviewDeepLink } from "./useReviewDeepLink";
import { ReviewDetailDrawer } from "./ReviewDetailDrawer";
import { toProductReviewDetail } from "../_lib/detail";
import { useTranslations } from "next-intl";

export function ProductReviewsTab() {
  const t = useTranslations();
  const { request, busyId, modalProps } = useReviewModeration(
    "reviews",
    (id, body) => adminApi.updateReviewStatus(id, body),
    t("admin.accounts.reviews.productReview"),
  );
  const [selectedId, setSelectedId] = useReviewDeepLink();

  const columns = productReviewColumns(request, t, busyId, setSelectedId);

  return (
    <ResourceList<Review>
      resource="reviews"
      fetcher={(params) => adminApi.getReviews(params)}
      getRowId={(r) => r.id}
      syncUrl
      filters={reviewFilterFields(t)}
      initialFilters={REVIEW_DEEP_LINK_FILTERS}
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
        onAct={request}
        busyId={busyId}
        onClose={() => setSelectedId(null)}
      />
      <ReviewModerationModal {...modalProps} />
    </ResourceList>
  );
}
