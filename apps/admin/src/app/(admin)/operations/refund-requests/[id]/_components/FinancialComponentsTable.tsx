"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/DataTable";
import { col } from "@/components/table/columns";
import type { RefundFinancialComponent } from "../types";

/** İade v2 kararının kalem tablosu (bileşen / işlem / net / vergi / brüt). */
export function FinancialComponentsTable({
  components,
}: {
  components: RefundFinancialComponent[];
}) {
  const t = useTranslations();
  const columns = useMemo(
    () => [
      col.text(
        t("admin.operations.refundRequests.decisionV2.component"),
        (c: RefundFinancialComponent) => c.componentCode,
      ),
      col.text(
        t("admin.operations.refundRequests.decisionV2.treatment"),
        (c: RefundFinancialComponent) => c.treatment,
      ),
      col.money(
        t("admin.operations.refundRequests.decisionV2.net"),
        (c: RefundFinancialComponent) => c.netAmount,
      ),
      col.money(
        t("admin.operations.refundRequests.decisionV2.tax"),
        (c: RefundFinancialComponent) => c.taxAmount,
      ),
      col.money(
        t("admin.operations.refundRequests.decisionV2.gross"),
        (c: RefundFinancialComponent) => c.grossAmount,
      ),
    ],
    [t],
  );
  return (
    <DataTable
      dense
      columns={columns}
      data={components}
      getRowId={(c) => `${c.componentCode}:${c.treatment}`}
    />
  );
}
