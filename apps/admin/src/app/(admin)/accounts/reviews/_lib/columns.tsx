import Image from "next/image";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import {
  type Review,
  type UserRating,
  type ReviewStatus,
  reviewStatusConfig,
} from "./types";
import { Stars } from "../_components/Stars";
import { reviewRowMenu } from "./rowActions";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

type Act = (id: string, s: ReviewStatus) => void;

export function productReviewColumns(act: Act, t: T, busyId?: string) {
  return [
    col.id<Review>(t("admin.accounts.reviews.reviewId"), (r) => r.id),
    col.custom<Review>(
      t("admin.accounts.reviews.product"),
      (r) => (
        <div className="flex items-center gap-3">
          {r.product.images?.[0] ? (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
              <Image
                src={r.product.images[0].url}
                alt={r.product.title}
                fill
                className="object-cover"
              />
            </div>
          ) : (
            <div className="h-10 w-10 shrink-0 rounded bg-surface-alt" />
          )}
          <span
            className="min-w-0 truncate text-sm font-medium text-heading"
            title={r.product.title}
          >
            {r.product.title}
          </span>
        </div>
      ),
      { grow: 3, minWidth: 220, sortKey: "product.title", sortType: "text" },
    ),
    col.custom<Review>(
      t("common.user"),
      (r) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600">
            {r.user.displayName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-heading">
              {r.user.displayName}
            </p>
            {r.isVerifiedPurchase && (
              <span className="flex items-center gap-1 text-[10px] text-success-700">
                <CheckCircleIcon className="h-3 w-3" />
                {t("admin.accounts.reviews.verifiedBuyer")}
              </span>
            )}
          </div>
        </div>
      ),
      { grow: 2, minWidth: 170, sortKey: "user.displayName", sortType: "text" },
    ),
    col.custom<Review>(
      t("admin.accounts.reviews.review"),
      (r) => (
        <div className="space-y-1">
          <Stars score={r.score} />
          {r.title && (
            <p className="text-sm font-medium text-heading">{r.title}</p>
          )}
          {r.review && (
            <p className="line-clamp-3 text-sm text-muted">{r.review}</p>
          )}
        </div>
      ),
      { grow: 3, minWidth: 240, sortKey: "score", sortType: "number" },
    ),
    col.badge<Review>(
      t("common.status"),
      (r) => <Badge status={r.status} config={reviewStatusConfig(t)} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.date<Review>(t("common.date"), "createdAt"),
    col.rowMenu<Review>((r) =>
      reviewRowMenu(r.status, (s) => act(r.id, s), t, busyId === r.id),
    ),
  ];
}

export function sellerReviewColumns(act: Act, t: T, busyId?: string) {
  return [
    col.id<UserRating>(t("admin.accounts.reviews.reviewId"), (r) => r.id),
    col.user<UserRating>(
      t("admin.accounts.reviews.sender"),
      (r) => ({
        name: r.giver?.displayName ?? "—",
        secondary: r.giver?.email,
      }),
      { sortKey: "giver.displayName" },
    ),
    col.user<UserRating>(
      t("admin.accounts.reviews.receiverSeller"),
      (r) => ({
        name: r.receiver?.displayName ?? "—",
        secondary: r.receiver?.email,
      }),
      { sortKey: "receiver.displayName" },
    ),
    col.id<UserRating>(
      t("admin.operations.common.sellerId"),
      (r) => r.receiver?.id,
    ),
    col.custom<UserRating>(
      t("admin.accounts.reviews.score"),
      (r) => <Stars score={r.score} />,
      {
        grow: 1,
        minWidth: 120,
        sortKey: "score",
        sortType: "number",
      },
    ),
    col.muted<UserRating>(
      t("admin.accounts.reviews.comment"),
      (r) => r.comment || null,
      {
        grow: 3,
        minWidth: 220,
        sortKey: "comment",
      },
    ),
    col.badge<UserRating>(
      t("common.status"),
      (r) => (
        <Badge status={r.status || "approved"} config={reviewStatusConfig(t)} />
      ),
      { sortKey: "status", sortType: "text" },
    ),
    col.muted<UserRating>(
      t("admin.accounts.reviews.source"),
      (r) =>
        r.orderId
          ? t("admin.accounts.reviews.order")
          : r.tradeId
            ? t("admin.accounts.reviews.trade")
            : "—",
      {
        grow: 1,
        minWidth: 100,
        sortKey: "orderId",
      },
    ),
    col.id<UserRating>(
      t("admin.accounts.reviews.orderCode"),
      (r) => r.orderId ?? r.tradeId,
    ),
    col.date<UserRating>(t("common.date"), "createdAt"),
    col.rowMenu<UserRating>((r) =>
      reviewRowMenu(r.status, (s) => act(r.id, s), t, busyId === r.id),
    ),
  ];
}
