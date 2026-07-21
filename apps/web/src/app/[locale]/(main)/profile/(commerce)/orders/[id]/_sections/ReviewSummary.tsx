/** @format */

"use client";

import { StarIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui";
import { ordersApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { hasReviewed, type OrderDetail } from "../_lib/types";

function Stars({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) =>
        s <= score ? (
          <StarIcon key={s} className="h-4 w-4 text-warning-400" />
        ) : (
          <StarOutlineIcon key={s} className="h-4 w-4 text-border-strong" />
        ),
      )}
    </div>
  );
}

/** Read-only "Değerlendirmeni Gör" — the buyer's submitted product + seller
 *  review, shown once the order has been reviewed (in place of the write CTA). */
export default function ReviewSummary({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const { data } = useQuery({
    queryKey: queryKeys.orders.myReview(order.id),
    queryFn: async () => (await ordersApi.getMyReview(order.id)).data,
    enabled: hasReviewed(order),
  });

  if (!hasReviewed(order)) return null;
  const product = data?.product;
  const seller = data?.seller;

  return (
    <SectionCard title={t("review.yourReview")}>
      {product && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">
              {t("review.productScore")}
            </span>
            <Stars score={product.score} />
          </div>
          {product.title && (
            <p className="font-medium text-heading">{product.title}</p>
          )}
          {product.review && (
            <p className="text-sm text-body">{product.review}</p>
          )}
          {product.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {product.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          )}
        </div>
      )}
      {seller && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">
              {t("review.sellerReview")}
            </span>
            <Stars score={seller.score} />
          </div>
          {seller.comment && (
            <p className="whitespace-pre-line text-sm text-body">
              {seller.comment}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
