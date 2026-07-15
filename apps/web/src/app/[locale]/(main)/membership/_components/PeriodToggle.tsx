/** @format */

"use client";

import { Badge, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import type { Period } from "../_lib/types";

export default function PeriodToggle({
  value,
  onChange,
  discountPct,
}: {
  value: Period;
  onChange: (p: Period) => void;
  discountPct: number;
}) {
  const t = useTranslations();

  return (
    <div className="flex justify-center">
      <Tabs value={value} onValueChange={(v) => onChange(v as Period)}>
        <TabsList>
          <TabsTrigger value="monthly">{t("membership.monthly")}</TabsTrigger>
          <TabsTrigger value="yearly">
            <span className="flex items-center gap-2">
              {t("membership.yearly")}
              {discountPct > 0 && (
                <Badge variant="success" size="sm">
                  %{discountPct} {t("membership.savePercent")}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
