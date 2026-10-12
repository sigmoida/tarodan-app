"use client";

import { useTranslations } from "next-intl";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { Eyebrow } from "@/components/detail/SectionTitle";
import {
  financialTotalsGroups,
  shippingRefundValue,
} from "../_lib/financialTotals";
import type { RefundFinancialTotals } from "../types";

const PREFIX = "admin.operations.refundRequests.totals";

/**
 * Kalem tablosunun altındaki tarafa göre toplamlar. Taraflar birbirine
 * eklenmez — yardımcı metin bunu söyler.
 */
export function FinancialTotalsBlock({
  totals,
}: {
  totals: RefundFinancialTotals;
}) {
  const t = useTranslations();

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted">{t(`${PREFIX}.helper`)}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {financialTotalsGroups(totals).map((group) => (
          <Panel key={group.side} tone="muted" padding="sm">
            <Eyebrow className="mb-2">{t(`${PREFIX}.sides.${group.side}`)}</Eyebrow>
            <DataList columns={1}>
              {group.rows.map((row) => (
                <Field key={row.line} label={t(`${PREFIX}.lines.${row.line}`)}>
                  {row.value}
                </Field>
              ))}
            </DataList>
          </Panel>
        ))}
      </div>
      <DataList columns={1}>
        <Field label={t(`${PREFIX}.shippingRefund`)}>
          {shippingRefundValue(totals)}
        </Field>
      </DataList>
    </div>
  );
}
