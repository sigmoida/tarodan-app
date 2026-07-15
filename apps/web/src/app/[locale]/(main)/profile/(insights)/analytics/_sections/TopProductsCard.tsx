/** @format */

import { Link } from "@/i18n/navigation";
import { TrophyIcon, EyeIcon, HeartIcon } from "@heroicons/react/24/outline";
import { Badge, type BadgeVariant } from "@tarodan/ui";
import SectionCard from "@/components/ui/SectionCard";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { formatTL } from "@/lib/format";
import type { TopProduct } from "../_lib/types";

const RANK_CLASS = [
  "bg-warning-400 text-inverted",
  "bg-border-strong text-inverted",
  "bg-warning-600 text-inverted",
];

function statusBadge(status: string): { variant: BadgeVariant; label: string } {
  if (status === "active") return { variant: "success", label: "Aktif" };
  if (status === "sold") return { variant: "secondary", label: "Satıldı" };
  return { variant: "primary", label: status };
}

export default function TopProductsCard({
  products,
}: {
  products: TopProduct[];
}) {
  return (
    <SectionCard
      title="En Popüler İlanlar"
      badge={<TrophyIcon className="h-5 w-5 text-warning-500" />}
    >
      <div className="space-y-3">
        {products.map((product, index) => {
          const badge = statusBadge(product.status);
          return (
            <Link
              key={product.id}
              href={`/listings/${product.id}`}
              className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-surface"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${
                  RANK_CLASS[index] ?? "bg-surface-alt text-muted"
                }`}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-heading transition-colors group-hover:text-primary-600">
                  {product.title}
                </p>
                <div className="flex items-center gap-4 text-sm text-muted">
                  <span className="flex items-center gap-1">
                    <EyeIcon className="h-4 w-4" />
                    {product.views.toLocaleString("tr-TR")}
                  </span>
                  <span className="flex items-center gap-1">
                    <HeartIcon className="h-4 w-4" />
                    {product.favorites}
                  </span>
                  <span className="font-medium text-primary-600">
                    {formatTL(getProductEffectivePrice(product))}
                  </span>
                </div>
              </div>
              <Badge variant={badge.variant} size="sm">
                {badge.label}
              </Badge>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
