import Link from "next/link";
import { Badge, orderStatusConfig } from "@tarodan/ui";
import { ShoppingBagIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { fmtTry } from "@/lib/format";
import { TruncatedText } from "@/components/table";
import type {
  OrderGroupRow,
  OrderLineItem,
  SellerPackage,
} from "../_lib/orders";

/** One product line inside the expanded detail row. */
function LineItem({ item }: { item: OrderLineItem }) {
  const t = useTranslations();
  return (
    <Link
      href={`/operations/orders/${item.id}`}
      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-alt"
    >
      {item.productImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.productImageUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded border border-border-subtle bg-surface-alt object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border-subtle bg-surface-alt text-muted">
          <ShoppingBagIcon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <TruncatedText className="text-sm font-medium text-heading">
          {item.product?.title ??
            t("admin.operations.orders.itemCountUnit", { count: 1 })}
        </TruncatedText>
        <span className="font-mono text-xs text-muted">{item.orderNumber}</span>
      </div>
      {item.cancellationType === "iptal" ? (
        <Badge
          status="cancelled"
          config={orderStatusConfig}
          label={t("admin.operations.orders.status.cancelledConfirmed")}
        />
      ) : (
        <Badge status={item.status} config={orderStatusConfig} />
      )}
      <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-body">
        {fmtTry(item.totalAmount)}
      </span>
    </Link>
  );
}

/** One satıcı-paketi block: seller subheader + that seller's line items. */
function PackageBlock({ pkg }: { pkg: SellerPackage }) {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-border-subtle bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-1.5">
        <Link
          href={`/accounts/users/${pkg.seller.id}`}
          className="truncate text-sm font-medium text-primary-600 hover:underline"
        >
          {pkg.seller.displayName}
        </Link>
        <span className="shrink-0 rounded bg-surface-alt px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          {t("admin.operations.orders.sellerPackage")} ·{" "}
          {t("admin.operations.orders.itemCountUnit", {
            count: pkg.items.length,
          })}
        </span>
      </div>
      <div className="divide-y divide-border-subtle p-1">
        {pkg.items.map((item) => (
          <LineItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * The expanded detail row for an order/checkout group. Lists the product line
 * items; when the cart spans multiple sellers/packages the items are grouped by
 * seller (satıcı paketi) with a per-seller subheader.
 */
export function OrderGroupDetail({ row }: { row: OrderGroupRow }) {
  if (row.isMultiSeller) {
    return (
      <div className="space-y-2 bg-surface-alt/40 px-4 py-3">
        {row.packages.map((pkg) => (
          <PackageBlock key={pkg.key} pkg={pkg} />
        ))}
      </div>
    );
  }
  return (
    <div className="bg-surface-alt/40 px-4 py-2">
      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface">
        {row.items.map((item) => (
          <LineItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
