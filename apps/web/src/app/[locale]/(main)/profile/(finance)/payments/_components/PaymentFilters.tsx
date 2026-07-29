/** @format */

"use client";

import { Button, DatePicker, Select } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { PaymentFilterState } from "../_lib/types";

interface Props {
  filters: PaymentFilterState;
  onChange: (key: keyof PaymentFilterState, value: string) => void;
  onClear: () => void;
}

export default function PaymentFilters({ filters, onChange, onClear }: Props) {
  const t = useTranslations();

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-body">
            {t("common.status")}
          </span>
          <Select
            value={filters.status}
            onChange={(e) => onChange("status", e.target.value)}
          >
            <option value="">{t("common.all")}</option>
            <option value="pending">{t("payment.statusPending")}</option>
            <option value="processing">{t("payment.statusProcessing")}</option>
            <option value="completed">{t("order.statusCompleted")}</option>
            <option value="failed">{t("trade.shipmentStatus.failed")}</option>
            <option value="refunded">{t("order.statusRefunded")}</option>
          </Select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-body">
            {t("payment.provider")}
          </span>
          <Select
            value={filters.provider}
            onChange={(e) => onChange("provider", e.target.value)}
          >
            <option value="">{t("common.all")}</option>
            <option value="paytr">PayTR</option>
          </Select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-body">
            {t("payment.startDate")}
          </span>
          <DatePicker
            value={filters.startDate}
            onChange={(v) => onChange("startDate", v)}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-body">
            {t("payment.endDate")}
          </span>
          <DatePicker
            value={filters.endDate}
            onChange={(v) => onChange("endDate", v)}
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t("product.clearFilters")}
        </Button>
      </div>
    </div>
  );
}
