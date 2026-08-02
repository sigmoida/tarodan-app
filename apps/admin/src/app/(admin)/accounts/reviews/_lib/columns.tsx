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
    col.product<Review>(
      t("admin.accounts.reviews.product"),
      (r) => ({
        title: r.product.title,
        image: r.product.images?.[0]?.url,
        href: `/catalog/products/${r.product.id}`,
      }),
      { grow: 5, minWidth: 480, sortKey: "product.title", sortType: "text" },
    ),
    col.user<Review>(
      t("common.user"),
      (r) => ({
        name: r.user.displayName,
        secondary: r.user.email,
        avatar: r.user.avatarUrl,
        href: `/accounts/users/${r.user.id}`,
      }),
      {
        grow: 4,
        minWidth: 380,
        sortKey: "user.displayName",
        sortType: "text",
      },
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
    col.user<UserRating>(
      t("admin.accounts.reviews.sender"),
      (r) => ({
        name: r.giver?.displayName ?? "—",
        secondary: r.giver?.email,
        avatar: r.giver?.avatarUrl,
        href: r.giver?.id ? `/accounts/users/${r.giver.id}` : undefined,
      }),
      { minWidth: 240, sortKey: "giver.displayName" },
    ),
    col.user<UserRating>(
      t("admin.accounts.reviews.receiverSeller"),
      (r) => ({
        name: r.receiver?.displayName ?? "—",
        secondary: r.receiver?.email,
        avatar: r.receiver?.avatarUrl,
        href: r.receiver?.id ? `/accounts/users/${r.receiver.id}` : undefined,
      }),
      { minWidth: 260, sortKey: "receiver.displayName" },
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
