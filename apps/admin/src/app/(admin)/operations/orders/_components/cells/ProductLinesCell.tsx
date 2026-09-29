import { useTranslations } from "next-intl";
import type { AdminOrderLineProduct, AdminOrderListRow } from "@tarodan/types";
import { CellProduct } from "@/components/table";
import { PackageStack } from "./PackageStack";

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
 * Ürün bilgileri, paket başına gruplu kalemler (görsel, ad, adet, marka,
 * ürün/model kodu, sipariş no). Satıcı ve paket numarası yandaki Satıcı
 * kolonundadır (`SellerLinesCell`), kalem kalem aynı hizada. Paketi olmayan
 * teklif satırında teklif verilen tek ürün.
 */
export function ProductLinesCell({
  row,
}: {
  // Yalnız paketleri ve teklifi okur: İptaller listesinin satırı da aynı
  // paket sözleşmesini taşır ve bu hücreyi yeniden kullanır.
  row: Pick<AdminOrderListRow, "packages" | "offer">;
}) {
  if (row.packages.length === 0 && row.offer) {
    return (
      <div className="flex h-16 min-w-0 items-center">
        <ProductLine
          product={row.offer.product}
          quantity={1}
          orderNumber={null}
        />
      </div>
    );
  }

  return (
    <PackageStack
      packages={row.packages}
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
