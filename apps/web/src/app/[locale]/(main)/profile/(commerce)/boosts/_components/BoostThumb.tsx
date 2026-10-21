/** @format */

"use client";

import OptimizedImage from "@/components/OptimizedImage";
import { imagePlaceholder } from "@/lib/placeholder";

/** The listing image of a boost card: 64 px on a card, 48 px on a history row. */
export default function BoostThumb({
  src,
  title,
  productId,
  size,
}: {
  src: string | null;
  title: string;
  productId: string;
  size: "md" | "lg";
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg bg-surface-alt ${
        size === "lg" ? "h-16 w-16" : "h-12 w-12"
      }`}
    >
      <OptimizedImage
        src={src ?? imagePlaceholder("200x200")}
        alt={title}
        fill
        sizes={size === "lg" ? "64px" : "48px"}
        className="object-cover"
        fallbackSrc={imagePlaceholder("200x200")}
        logContext={{ listingId: productId, page: "profile-boosts" }}
      />
    </div>
  );
}
