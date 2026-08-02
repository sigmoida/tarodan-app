import { Badge, orderStatusConfig } from "@tarodan/ui";
import { ShoppingBagIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { fmtTry } from "@/lib/format";
import { CellUser, TruncatedText } from "@/components/table";
import type { OrderGroupRow, OrderLineItem } from "../_lib/orders";

/** One product line inside the expanded detail row. */
function LineItem({ item }: { item: OrderLineItem }) {
  const t = useTranslations();
  return (
    <div className="grid min-w-[1120px] grid-cols-[minmax(400px,2fr)_minmax(280px,1.25fr)_minmax(220px,1fr)_auto_112px] items-center gap-4 rounded-md px-3 py-2 hover:bg-surface-alt">
      {/* Bilgi amaçlı alan — tıklama aksiyonu yok. Grup dosyasına gidiş yalnız
          "Grup No" kolonundan yapılır; buradaki link aynı ekrana giden gereksiz
          ikinci bir yoldu. */}
      <div className="flex min-w-0 items-center gap-3">
        {item.productImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.productImageUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded border border-border-subtle bg-surface-alt object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border-subtle bg-surface-alt text-muted">
            <ShoppingBagIcon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <TruncatedText className="text-sm font-medium text-heading">
            {item.product?.title ??
              t("admin.operations.orders.itemCountUnit", { count: 1 })}
          </TruncatedText>
          <span className="font-mono text-xs text-muted">
            {item.orderNumber}
          </span>
        </div>
      </div>
      <CellUser
        name={item.seller.displayName}
        secondary={item.seller.email}
        href={`/accounts/users/${item.seller.id}`}
      />
      <div className="min-w-0">
        <p className="text-xs text-muted">
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
    </div>
  );
}

/**
 * A bordered box of line items = BİR KOLİ (satıcı paketi). Başlıkta kolinin
 * kendi numarası (PKG-…) yazar: sepet numarasından ve sipariş numaralarından
 * bağımsız, Sürat'a giden ve kargo etiketinde okunan kod.
 */
function ItemsBox({
  items,
  packageNumber,
}: {
  items: OrderLineItem[];
  packageNumber?: string | null;
}) {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-border-subtle bg-surface">
      {packageNumber && (
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <span className="text-xs text-muted">
            {t("admin.operations.common.packageNumber")}
          </span>
          <span className="font-mono text-sm font-medium text-heading">
            {packageNumber}
          </span>
        </div>
      )}
      <div className="divide-y divide-border-subtle">
        {items.map((item) => (
          <LineItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * The expanded detail row for an order/checkout group. Lists the product line
 * items; when the cart spans multiple sellers/packages the items are grouped
 * into one box per satıcı paketi (the seller is shown on each line item).
 */
export function OrderGroupDetail({ row }: { row: OrderGroupRow }) {
  if (row.isMultiSeller) {
    return (
      <div className="space-y-2 bg-surface-alt/40 px-4 py-3">
        {row.packages.map((pkg) => (
          <ItemsBox
            key={pkg.key}
            items={pkg.items}
            packageNumber={pkg.packageNumber}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="bg-surface-alt/40 px-4 py-2">
      <ItemsBox
        items={row.items}
        packageNumber={row.packages[0]?.packageNumber}
      />
    </div>
  );
}
