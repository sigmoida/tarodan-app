/** @format */

import { Link } from "@/i18n/navigation";
import OptimizedImage from "@/components/OptimizedImage";
import { TagIcon } from "@heroicons/react/24/outline";
import SectionCard from "@/components/ui/SectionCard";
import { formatDate, formatTL } from "@/lib/format";
import type { RecentSale } from "../_lib/types";

export default function RecentSalesSection({ sales }: { sales: RecentSale[] }) {
  if (sales.length === 0) return null;

  return (
    <SectionCard
      title="Son Satışlar"
      action={
        <Link
          href="/profile/orders"
          className="text-sm font-medium text-primary-500 hover:text-primary-600"
        >
          Tümünü Gör
        </Link>
      }
    >
      <div className="space-y-3">
        {sales.map((sale) => (
          <Link
            key={sale.id}
            href={`/profile/orders/${sale.orderId}`}
            className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-surface"
          >
            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
              {sale.productImage ? (
                <OptimizedImage
                  src={sale.productImage}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <TagIcon className="h-5 w-5 text-subtle" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-heading group-hover:text-primary-600">
                {sale.productTitle}
              </p>
              <p className="text-xs text-muted">
                {sale.buyerName} · {formatDate(sale.soldAt)}
              </p>
            </div>
            <span className="whitespace-nowrap text-sm font-bold text-success-600">
              +{formatTL(sale.amount)}
            </span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
