"use client";

import Link from "next/link";
import { Badge, orderStatusConfig } from "@tarodan/ui";
import { ShoppingBagIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import type { OrderGroup, OrderPackageItem, OrderPackageView } from "../types";

function PackageItem({ item }: { item: OrderPackageItem }) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-3 py-2">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg border border-border-subtle bg-surface-alt object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-alt text-muted">
          <ShoppingBagIcon className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={`/catalog/products/${item.productId}`}
          className="block truncate font-medium text-primary-600 hover:text-primary-700"
        >
          {item.title ?? item.orderNumber}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <Link
            href={`/operations/orders/${item.orderId}`}
            className="font-mono hover:underline"
          >
            {item.orderNumber}
          </Link>
          {item.quantity > 1 && (
            <span>
              {t("admin.operations.orders.itemCountUnit", {
                count: item.quantity,
              })}
            </span>
          )}
        </div>
      </div>
      <Badge status={item.status} config={orderStatusConfig} />
      <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-body">
        {fmtTry(item.totalAmount)}
      </span>
    </div>
  );
}

function PackageBlock({
  pkg,
  showHeader,
}: {
  pkg: OrderPackageView;
  showHeader: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-border-subtle">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-alt/50 px-4 py-2">
        <Link
          href={`/accounts/users/${pkg.seller.id}`}
          className="block min-w-0 truncate font-medium text-primary-600 hover:underline"
        >
          {pkg.seller.displayName}
        </Link>
        <span className="shrink-0 text-right text-xs text-muted">
          {showHeader && (
            <>
              {t("admin.operations.orders.sellerPackage")}
              <br />
            </>
          )}
          {pkg.shippingCost > 0 &&
            t("admin.operations.orders.packageShipping", {
              amount: fmtTry(pkg.shippingCost),
            })}
        </span>
      </div>
      <div className="divide-y divide-border-subtle px-4">
        {pkg.items.map((item) => (
          <PackageItem key={item.orderId} item={item} />
        ))}
      </div>
      {pkg.shipment && (
        <dl className="grid gap-2 border-t border-border-subtle px-4 py-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">
              {t("admin.operations.common.trackingNumber")}
            </dt>
            <dd className="break-all font-mono text-body">
              {pkg.shipment.providerTrackingId ??
                pkg.shipment.trackingNumber ??
                "-"}
            </dd>
          </div>
          {pkg.shipment.trackingNumber && (
            <div>
              <dt className="text-muted">
                {t("admin.operations.orders.internalTrackingNumber")}
              </dt>
              <dd className="break-all font-mono text-body">
                {pkg.shipment.trackingNumber}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * Consolidated products view for a placed order: lists every line item in the
 * checkout group, grouped by seller (satıcı paketi) when the cart spans multiple
 * sellers. Rendered in place of the single-product section for multi-item orders.
 */
export function PackagesSection({ group }: { group: OrderGroup }) {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.operations.orders.packagesTitle")}>
      <div className="space-y-3">
        <dl className="rounded border border-border-subtle bg-surface-alt/50 px-4 py-2 text-xs">
          <div>
            <dt className="text-muted">
              {t("admin.operations.orders.groupNumber")}
            </dt>
            <dd className="break-all font-mono text-body">
              {group.groupNumber ?? group.id}
            </dd>
          </div>
        </dl>
        {group.packages.map((pkg) => (
          <PackageBlock
            key={pkg.packageId ?? pkg.seller.id}
            pkg={pkg}
            showHeader={group.isMultiSeller}
          />
        ))}
      </div>
    </SectionCard>
  );
}
