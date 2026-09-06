import Link from "next/link";
import { Badge, orderStatusConfig, shipmentStatusConfig } from "@tarodan/ui";
import { ShoppingBagIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { fmtTry } from "@/lib/format";
import { TruncatedText } from "@/components/table";
import type {
  OrderGroupRow,
  OrderLineItem,
  SellerPackage,
} from "../_lib/orders";
import { statusConfig } from "@/lib/statusLabels";

/** One product line inside a koli card. */
function LineItem({ item }: { item: OrderLineItem }) {
  const t = useTranslations();
  return (
    <div className="grid min-w-[880px] grid-cols-[minmax(320px,2fr)_minmax(200px,1.2fr)_minmax(150px,auto)_minmax(150px,auto)_110px] items-center gap-4 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {item.productImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.productImageUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-md border border-border-subtle bg-surface-alt object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-alt text-muted">
            <ShoppingBagIcon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          {item.product ? (
            <Link
              href={`/catalog/products/${item.product.id}`}
              className="block truncate text-sm font-medium text-heading hover:text-primary-600 hover:underline"
            >
              {item.product.title}
            </Link>
          ) : (
            <TruncatedText className="text-sm font-medium text-heading">
              {t("admin.operations.orders.itemCountUnit", { count: 1 })}
            </TruncatedText>
          )}
          <span className="font-mono text-xs text-muted">
            {item.orderNumber}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted">
          {t("admin.operations.common.trackingNumber")}
        </p>
        <p className="truncate font-mono text-sm text-body">
          {item.trackingNumber ?? item.internalTrackingNumber ?? "—"}
        </p>
        {item.trackingNumber &&
          item.internalTrackingNumber &&
          item.internalTrackingNumber !== item.trackingNumber && (
            <p className="truncate font-mono text-xs text-muted">
              {t("admin.operations.orders.internalTrackingNumber")}:{" "}
              {item.internalTrackingNumber}
            </p>
          )}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">
          {t("admin.operations.orders.cargoStatus")}
        </p>
        {item.shipmentStatus ? (
          <Badge
            status={item.shipmentStatus}
            config={statusConfig(shipmentStatusConfig, t)}
          />
        ) : (
          <span className="text-sm text-subtle">—</span>
        )}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">
          {t("common.status")}
        </p>
        {item.cancellationType === "iptal" ? (
          <Badge
            status="cancelled"
            config={statusConfig(orderStatusConfig, t)}
            label={t("admin.operations.orders.status.cancelledConfirmed")}
          />
        ) : (
          <Badge
            status={item.status}
            config={statusConfig(orderStatusConfig, t)}
          />
        )}
      </div>
      <span className="text-right text-sm font-semibold tabular-nums text-body">
        {fmtTry(item.totalAmount)}
      </span>
    </div>
  );
}

/**
 * BİR KOLİ (satıcı paketi) = bir kart. Başlıkta koli numarası (PKG-…, kargo
 * etiketindeki ve Sürat'a giden kod), satıcı ve satır sayısı; gövdede ürün
 * satırları. Satıcı karta bir kez yazılır, her satırda tekrarlanmaz.
 */
function PackageCard({ pkg }: { pkg: SellerPackage }) {
  const t = useTranslations();
  const subtotal = pkg.items.reduce((s, i) => s + (i.totalAmount || 0), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border-subtle bg-surface-alt/60 px-4 py-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-muted">
            {t("admin.operations.common.packageNumber")}
          </span>
          <span className="font-mono font-medium text-heading">
            {pkg.packageNumber ?? "—"}
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-muted">
            {t("admin.operations.common.seller")}
          </span>
          <Link
            href={`/accounts/users/${pkg.seller.id}`}
            className="font-medium text-primary-600 hover:underline"
          >
            {pkg.seller.displayName}
          </Link>
          {pkg.seller.email && (
            <span className="text-xs text-muted">{pkg.seller.email}</span>
          )}
        </span>
        <span className="ml-auto inline-flex items-center gap-3 text-xs text-muted">
          <span>
            {t("admin.operations.orders.itemCountUnit", {
              count: pkg.items.length,
            })}
          </span>
          <span className="font-semibold tabular-nums text-body">
            {fmtTry(subtotal)}
          </span>
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {pkg.items.map((item) => (
          <LineItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * Always-open detail under an order/checkout-group row: one card per koli
 * (seller package) with its product lines.
 */
export function OrderGroupDetail({ row }: { row: OrderGroupRow }) {
  return (
    <div className="space-y-3 bg-surface-alt/40 px-4 pb-4 pt-1">
      {row.packages.map((pkg) => (
        <PackageCard key={pkg.key} pkg={pkg} />
      ))}
    </div>
  );
}
