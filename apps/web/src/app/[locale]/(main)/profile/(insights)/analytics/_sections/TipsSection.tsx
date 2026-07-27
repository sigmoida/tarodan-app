/** @format */

import { useTranslations } from "next-intl";

const TIP_KEYS = [
  "analytics.tipPhotos",
  "analytics.tipTitles",
  "analytics.tipPricing",
] as const;

export default function TipsSection() {
  const t = useTranslations();
  return (
    <div className="rounded-lg border border-border bg-surface-alt p-6">
      <div>
        <div>
          <h3 className="mb-2 font-semibold text-heading">
            {t("analytics.tipsTitle")}
          </h3>
          <div className="grid gap-4 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3">
            {TIP_KEYS.map((key, i) => (
              <div key={key} className="flex items-start gap-2">
                <span className="font-bold text-primary-500">{i + 1}.</span>
                <p>{t(key)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
