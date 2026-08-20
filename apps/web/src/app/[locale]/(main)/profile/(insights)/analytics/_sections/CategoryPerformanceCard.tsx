/** @format */

"use client";

import SectionCard from "@/components/ui/SectionCard";
import type { CategoryStat } from "../_lib/types";
import { useTranslations } from "next-intl";

export default function CategoryPerformanceCard({
  categories,
}: {
  categories: CategoryStat[];
}) {
  const t = useTranslations();
  const maxViews = Math.max(...categories.map((c) => c.views), 1);

  return (
    <SectionCard title={t("profile.analyticsCategory.kategoriPerformansi")}>
      <div className="space-y-4">
        {categories.map((cat, index) => (
          <div key={index}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-heading">
                {cat.name}
              </span>
              <div className="flex items-center gap-3 text-sm text-muted">
                <span>
                  {t("profile.analytics.listingsCount", {
                    count: cat.listings,
                  })}
                </span>
                <span className="font-medium text-success-600">
                  {t("profile.analytics.salesCount", { count: cat.sales })}
                </span>
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-alt">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${(cat.views / maxViews) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-subtle">
              {t("profile.analytics.viewsCount", {
                count: cat.views.toLocaleString(t("common.dateLocale")),
              })}
            </p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
