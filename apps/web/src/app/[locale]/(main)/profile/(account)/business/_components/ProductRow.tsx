/** @format */

import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import {
  ArchiveBoxIcon,
  EyeIcon,
  HeartIcon,
} from "@heroicons/react/24/outline";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { formatTL } from "@/lib/format";
import type { ProductStats } from "../_lib/types";

export default function ProductRow({
  product,
  index,
  metric,
}: {
  product: ProductStats;
  index: number;
  metric: "views" | "likes";
}) {
  return (
    <Link
      href={`/listings/${product.id}`}
      className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-surface"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt text-sm font-bold text-muted">
        {index + 1}
      </div>
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
        {product.image ? (
          <OptimizedImage
            src={product.image}
            alt={product.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ArchiveBoxIcon className="h-6 w-6 text-subtle" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-heading transition-colors group-hover:text-primary-600">
          {product.title}
        </p>
        <p className="text-sm font-medium text-primary-600">
          {formatTL(getProductEffectivePrice(product))}
        </p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span
          className={`flex items-center gap-1 ${
            metric === "views" ? "text-info-600" : "text-muted"
          }`}
        >
          <EyeIcon className="h-4 w-4" />
          {product.viewCount.toLocaleString("tr-TR")}
        </span>
        <span
          className={`flex items-center gap-1 ${
            metric === "likes" ? "text-danger-600" : "text-muted"
          }`}
        >
          <HeartIcon className="h-4 w-4" />
          {product.likeCount.toLocaleString("tr-TR")}
        </span>
      </div>
    </Link>
  );
}
