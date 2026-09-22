import type { AdminOrderListRow } from "@tarodan/types";
import { col, type RowActionItem } from "@/components/table";
import type { Translate } from "@/lib/statusLabels";
import { OrderInfoCell } from "../_components/cells/OrderInfoCell";
import { PartyCell } from "../_components/cells/PartyCell";
import { ProductLinesCell } from "../_components/cells/ProductLinesCell";
import { SellerLinesCell } from "../_components/cells/SellerLinesCell";
import { UnitPriceCell } from "../_components/cells/UnitPriceCell";
import { CommissionCell } from "../_components/cells/CommissionCell";
import { InvoiceCell } from "../_components/cells/InvoiceCell";
import { CargoStatusCell } from "../_components/cells/CargoStatusCell";
import { rowLines, sellerSlotsExport } from "./rowView";

/**
 * Satır = sepet. Paket bazlı kolonlar (ürün, satıcı, birim fiyat, fatura,
 * kargo) aynı paket iskeletini kullanır ve çok satıcılı sepette kalem kalem
 * hizalı kalır; satıcı + PKG ürünün hemen yanındaki kolondadır. Kargo ve
 * durum son veri kolonundadır, ardından işlemler menüsü. Sıralama anahtarları
 * API'nin sepet sıralamasıyla birebir (`createdAt`, `buyer.displayName`,
 * `totalAmount`).
 */
export function orderColumns({
  t,
  rowMenu,
}: {
  t: Translate;
  rowMenu: (row: AdminOrderListRow) => RowActionItem[];
}) {
  return [
    col.custom<AdminOrderListRow>(
      t("admin.operations.orders.columns.orderInfo"),
      (row) => <OrderInfoCell row={row} />,
      {
        minWidth: 180,
        sortKey: "createdAt",
        sortType: "date",
        exportValue: (row) => row.number ?? "",
      },
    ),
    col.custom<AdminOrderListRow>(
      t("admin.operations.orders.buyer"),
      (row) => <PartyCell party={row.buyer} />,
      {
        minWidth: 230,
        sortKey: "buyer.displayName",
        sortType: "text",
        exportValue: (row) => row.buyer.displayName,
      },
    ),
    col.custom<AdminOrderListRow>(
      t("admin.operations.orders.columns.products"),
      (row) => <ProductLinesCell row={row} />,
      {
        minWidth: 360,
        exportValue: (row) =>
          (row.packages.length
            ? rowLines(row).map((line) => line.product.title)
            : [row.offer?.product.title ?? ""]
          ).join(" | "),
      },
    ),
    col.custom<AdminOrderListRow>(
      t("admin.operations.common.seller"),
      (row) => <SellerLinesCell row={row} />,
      { minWidth: 200, exportValue: sellerSlotsExport },
    ),
    col.custom<AdminOrderListRow>(
      t("admin.operations.orders.columns.unitPrice"),
      (row) => <UnitPriceCell row={row} />,
      { minWidth: 160, fixed: true },
    ),
    col.custom<AdminOrderListRow>(
      t("admin.operations.orders.columns.amountFees"),
      (row) => <CommissionCell row={row} />,
      {
        minWidth: 200,
        fixed: true,
        sortKey: "totalAmount",
        sortType: "number",
        exportValue: (row) => row.totalAmount,
      },
    ),
    col.custom<AdminOrderListRow>(
      t("admin.operations.orders.columns.invoice"),
      (row) => <InvoiceCell row={row} />,
      { minWidth: 180, fixed: true },
    ),
    col.custom<AdminOrderListRow>(
      t("admin.operations.orders.columns.cargoStatus"),
      (row) => <CargoStatusCell row={row} />,
      { minWidth: 230 },
    ),
    col.rowMenu<AdminOrderListRow>(rowMenu, { header: t("common.actions") }),
  ];
}
