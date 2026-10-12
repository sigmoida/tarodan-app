import type { ColumnDef } from "@tanstack/react-table";
import type { AdminRefundRow, AdminRefundTab } from "@tarodan/types";
import { col } from "@/components/table";
import { fmtNumber } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";
import {
  RefundAmountCell,
  RefundCargoCell,
  RefundInvoiceCell,
  RefundNoCell,
  RefundOrderCell,
  RefundPartiesCell,
  RefundReasonCell,
  RefundStatusCell,
  RefundWarehouseCell,
} from "../_components/RefundCells";
import { RefundMoneyCell } from "../_components/RefundMoneyCell";
import { refundColumnKeys, type RefundColumnKey } from "./columnVisibility";

/** "2 adet · iade 1" */
export function refundQuantityLine(
  t: Translate,
  product: AdminRefundRow["product"],
): string {
  return t("admin.operations.refunds.cells.quantity", {
    quantity: fmtNumber(product.quantity) ?? String(product.quantity),
    refund: fmtNumber(product.refundQuantity) ?? String(product.refundQuantity),
  });
}

type RefundColumnBuilder = (
  t: Translate,
  tab: AdminRefundTab,
) => ColumnDef<AdminRefundRow, unknown>;

const BUILDERS: Record<RefundColumnKey, RefundColumnBuilder> = {
  refundNo: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.refundNo"),
      (row) => <RefundNoCell row={row} />,
      { minWidth: 180, sortKey: "createdAt", sortType: "date" },
    ),
  order: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.order"),
      (row) => <RefundOrderCell row={row} />,
      { minWidth: 170 },
    ),
  party: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.party"),
      (row) => <RefundPartiesCell row={row} />,
      { minWidth: 240 },
    ),
  product: (t) =>
    col.product<AdminRefundRow>(
      t("admin.operations.refunds.columns.product"),
      (row) => ({
        title: row.product.title,
        secondary: row.product.productCode,
        tertiary: refundQuantityLine(t, row.product),
        href: `/catalog/products/${row.product.id}`,
      }),
      { minWidth: 280 },
    ),
  money: (t, tab) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.money"),
      (row) => <RefundMoneyCell money={row.money} tab={tab} />,
      { minWidth: 260 },
    ),
  cargo: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.cargo"),
      (row) => <RefundCargoCell row={row} />,
      { minWidth: 220 },
    ),
  warehouse: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.warehouse"),
      (row) => <RefundWarehouseCell row={row} />,
      { minWidth: 230 },
    ),
  reason: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.reason"),
      (row) => <RefundReasonCell row={row} />,
      { minWidth: 220 },
    ),
  amount: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.amount"),
      (row) => <RefundAmountCell row={row} />,
      { minWidth: 170, sortKey: "amount", sortType: "number" },
    ),
  status: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.status"),
      (row) => <RefundStatusCell row={row} />,
      { minWidth: 170, sortKey: "status", sortType: "text" },
    ),
  invoice: (t) =>
    col.custom<AdminRefundRow>(
      t("admin.operations.refunds.columns.invoice"),
      (row) => <RefundInvoiceCell row={row} />,
      { minWidth: 160 },
    ),
};

/** İadeler tablosunun kolonları; sekmeye göre görünür olanlar (`columnVisibility`). */
export function refundColumns(t: Translate, tab: AdminRefundTab) {
  return refundColumnKeys(tab).map((key) => BUILDERS[key](t, tab));
}
