/** @format */

import { pickLocalized, type TrustBadgeDto } from "@tarodan/types";
import { trustBadgeIcon } from "../lib/trustBadgeIcons";

/** Rozetler panelden gelir; liste boşsa (ya da API hatasında) bölüm çizilmez. */
export default function TrustBadges({
  badges,
  locale,
}: {
  badges: TrustBadgeDto[];
  locale: string;
}) {
  if (badges.length === 0) return null;

  return (
    <section className=" bg-surface">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        {badges.map((badge) => {
          const Icon = trustBadgeIcon(badge.icon);
          const description = pickLocalized(badge.description, locale);
          return (
            <div
              key={badge.id}
              className="flex flex-col items-center text-center px-2 py-3 bg-surface-elevated border border-border-subtle rounded"
            >
              <Icon className="w-5 h-5 text-primary-500 mb-1.5" />
              <p className="text-2xs sm:text-xs font-semibold text-heading leading-tight">
                {pickLocalized(badge.title, locale)}
              </p>
              {description && (
                <p className="text-2xs sm:text-2xs text-muted mt-0.5 hidden md:block">
                  {description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
