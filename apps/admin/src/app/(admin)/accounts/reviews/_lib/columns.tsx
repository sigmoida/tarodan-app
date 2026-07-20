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

type Act = (id: string, s: ReviewStatus) => void;

export function productReviewColumns(act: Act) {
  return [
    col.custom<Review>(
      "Ürün",
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
      { grow: 3, minWidth: 220 },
    ),
    col.custom<Review>(
      "Kullanıcı",
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
                Onaylı Alıcı
              </span>
            )}
          </div>
        </div>
      ),
      { grow: 2, minWidth: 170 },
    ),
    col.custom<Review>(
      "Değerlendirme",
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
    col.badge<Review>("Durum", (r) => (
      <Badge status={r.status} config={reviewStatusConfig} />
    )),
    col.date<Review>("Tarih", "createdAt"),
    col.rowMenu<Review>((r) => reviewRowMenu(r.status, (s) => act(r.id, s))),
  ];
}

export function sellerReviewColumns(act: Act) {
  return [
    col.user<UserRating>("Gönderen", (r) => ({
      name: r.giver?.displayName ?? "—",
      secondary: r.giver?.email,
    })),
    col.user<UserRating>("Alıcı (Satıcı)", (r) => ({
      name: r.receiver?.displayName ?? "—",
      secondary: r.receiver?.email,
    })),
    col.custom<UserRating>("Puan", (r) => <Stars score={r.score} />, {
      grow: 1,
      minWidth: 120,
      sortKey: "score",
      sortType: "number",
    }),
    col.muted<UserRating>("Yorum", (r) => r.comment || null, {
      grow: 3,
      minWidth: 220,
    }),
    col.badge<UserRating>(
      "Durum",
      (r) => (
        <Badge status={r.status || "approved"} config={reviewStatusConfig} />
      ),
      { sortKey: "status", sortType: "text" },
    ),
    col.muted<UserRating>(
      "Kaynak",
      (r) => (r.orderId ? "Sipariş" : r.tradeId ? "Takas" : "—"),
      {
        grow: 1,
        minWidth: 100,
      },
    ),
    col.date<UserRating>("Tarih", "createdAt"),
    col.rowMenu<UserRating>((r) =>
      reviewRowMenu(r.status, (s) => act(r.id, s)),
    ),
  ];
}
