import { useTranslations } from "next-intl";
import type { AdminOrderLineProduct, AdminOrderListRow } from "@tarodan/types";
import { CellProduct } from "@/components/table";
import { PackageStack } from "./PackageStack";
import { PartyInline } from "./PartyCell";

function ProductLine({
  product,
  quantity,
  orderNumber,
}: {
  product: AdminOrderLineProduct;
  quantity: number;
  orderNumber: string | null;
}) {
  const t = useTranslations();
  const codes = [
    t("admin.operations.orders.cells.quantity", { count: quantity }),
    product.brandName,
    product.productCode,
    product.modelCode,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <CellProduct
      title={product.title}
      image={product.imageUrl}
      href={`/catalog/products/${product.id}`}
      secondary={codes}
      tertiary={
        orderNumber ? (
          <span className="font-mono">{orderNumber}</span>
        ) : undefined
      }
    />
  );
}

/**
 * Ürün bilgileri, paket (satıcı) başına gruplu: başlıkta satıcı ve paket
 * numarası, altında kalemler (görsel, ad, adet, marka, ürün/model kodu,
 * sipariş no). Siparişe dönmemiş teklifte tek ürün ve teklif alan satıcı.
 */
export function ProductLinesCell({
  row,
}: {
  // Yalnız paketleri ve teklifi okur: İptaller listesinin satırı da aynı
  // paket sözleşmesini taşır ve bu hücreyi yeniden kullanır.
  row: Pick<AdminOrderListRow, "packages" | "offer">;
}) {
  const t = useTranslations();

  if (row.packages.length === 0 && row.offer) {
    return (
      <div className="flex min-w-0 flex-col">
        <div className="flex h-6 min-w-0 items-center gap-2 text-xs text-muted">
          <span className="shrink-0">
            {t("admin.operations.common.seller")}
          </span>
          <PartyInline party={row.offer.seller} />
        </div>
        <div className="flex h-16 items-center">
          <ProductLine
            product={row.offer.product}
            quantity={1}
            orderNumber={null}
          />
        </div>
      </div>
    );
  }

  return (
    <PackageStack
      packages={row.packages}
      header={(pkg) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">
            {t("admin.operations.common.seller")}
          </span>
          <PartyInline party={pkg.seller} />
          {pkg.packageNumber && (
            <span className="shrink-0 font-mono">{pkg.packageNumber}</span>
          )}
        </span>
      )}
      line={(line) => (
        <ProductLine
          product={line.product}
          quantity={line.quantity}
          orderNumber={line.orderNumber}
        />
      )}
    />
  );
}
