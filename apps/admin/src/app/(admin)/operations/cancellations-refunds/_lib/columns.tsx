import type { AdminCancellationRow } from "@tarodan/types";
import { col } from "@/components/table";
import type { Translate } from "@/lib/statusLabels";
import { PartyCell } from "@/app/(admin)/operations/orders/_components/cells/PartyCell";
import { ProductLinesCell } from "@/app/(admin)/operations/orders/_components/cells/ProductLinesCell";
import { SellerLinesCell } from "@/app/(admin)/operations/orders/_components/cells/SellerLinesCell";
import { UnitPriceCell } from "@/app/(admin)/operations/orders/_components/cells/UnitPriceCell";
import { CommissionCell } from "@/app/(admin)/operations/orders/_components/cells/CommissionCell";
import { CancellationInfoCell } from "../_components/cells/CancellationInfoCell";
import {
  CancelReasonCell,
  CancelledAtCell,
  RefundStateCell,
} from "../_components/cells/CancellationLineCells";

/**
 * İptaller tablosunun kolonları. Ürün, satıcı, birim fiyat ve tutar/komisyon hücreleri
 * siparişler ekranınınkilerin AYNISIDIR (satır aynı paket sözleşmesini taşır);
 * iptal tarihi / nedeni / durumu aynı paket iskeletinde kalem hizalıdır.
 * Sıralanabilir tek kolon iptal tarihidir (API yalnız iptal anına göre sıralar).
 */
export function cancellationColumns(t: Translate) {
  return [
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.orderInfo"),
      (row) => <CancellationInfoCell row={row} />,
      { minWidth: 180 },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.buyer"),
      (row) => <PartyCell party={row.buyer} />,
      { minWidth: 220 },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.products"),
      (row) => <ProductLinesCell row={row} />,
      { minWidth: 340 },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.seller"),
      (row) => <SellerLinesCell row={row} />,
      { minWidth: 200 },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.unitPrice"),
      (row) => <UnitPriceCell row={row} />,
      { minWidth: 150, fixed: true },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.amountFees"),
      (row) => <CommissionCell row={row} />,
      { minWidth: 190, fixed: true },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.cancelledAt"),
      (row) => <CancelledAtCell row={row} />,
      {
        minWidth: 190,
        sortKey: "cancelledAt",
        sortType: "date",
      },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.reason"),
      (row) => <CancelReasonCell row={row} />,
      {
        minWidth: 220,
      },
    ),
    col.custom<AdminCancellationRow>(
      t("admin.operations.cancellations.columns.refundState"),
      (row) => <RefundStateCell row={row} />,
      { minWidth: 160 },
    ),
  ];
}
