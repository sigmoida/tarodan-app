"use client";

import { Button, Input } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { useRateSetting } from "@/hooks/useRateSetting";
import { useTranslations } from "next-intl";

export function TradeRateCard() {
  const t = useTranslations();
  const {
    value: rate,
    setValue: setRate,
    onSave,
    isPending,
  } = useRateSetting({
    queryKey: "trade-commission-rate",
    load: async () =>
      (await adminApi.getTradeCommissionRate()).data?.rate as
        number | undefined,
    save: (r) => adminApi.setTradeCommissionRate(r),
    successMessage: t("admin.finance.commission.tradeRateUpdated"),
    fallback: "5",
  });

  return (
    <SectionCard
      title={t("admin.finance.commission.tradeCommission")}
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-muted">
        {t.rich("admin.finance.commission.tradeDescription", {
          strong: (chunks) => <b>{chunks}</b>,
        })}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          label={t("admin.finance.common.ratePercent")}
          value={rate}
          placeholder="5"
          onChange={(e) => setRate(e.target.value)}
          className="w-32"
        />
        <Button onClick={onSave} isLoading={isPending}>
          {t("common.save")}
        </Button>
      </div>
    </SectionCard>
  );
}
