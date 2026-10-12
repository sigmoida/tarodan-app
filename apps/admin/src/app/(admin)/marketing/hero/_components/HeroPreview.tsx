"use client";

import { useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button, cn } from "@tarodan/ui";
import { Panel } from "@/components/detail/Panel";
import type { LocaleLang } from "@/lib/localized-form";
import { heroPreviewModel } from "../_lib/preview";
import type { HeroFormValues } from "../_lib/types";

/**
 * Formdan beslenen sadeleştirilmiş hero maketi: görsel tarafı, başlık, alt
 * başlık ve iki düğme. Yalnız yerleşimi gösterir; gerçek hero'nun yerine geçmez.
 */
export function HeroPreview({ lang }: { lang: LocaleLang }) {
  const t = useTranslations();
  const values = useWatch() as Partial<HeroFormValues>;
  const m = heroPreviewModel(values, lang);
  const [primary, secondary] = m.buttons;

  return (
    <Panel tone="muted" className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t("admin.marketing.hero.preview.title")}
      </p>
      <div
        className={cn(
          "grid grid-cols-2 items-center gap-4 rounded-lg bg-surface p-4",
          m.imageSide === "left" && "[&>*:first-child]:order-2",
        )}
      >
        <div className="min-w-0 space-y-2">
          <p className="break-words text-lg font-semibold text-heading">
            {m.title || t("admin.marketing.hero.preview.titlePlaceholder")}
          </p>
          {m.subtitle ? (
            <p className="break-words text-sm text-muted">{m.subtitle}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {primary ? (
              <Button type="button" size="sm" tabIndex={-1}>
                {primary}
              </Button>
            ) : null}
            {secondary ? (
              <Button type="button" size="sm" variant="outline" tabIndex={-1}>
                {secondary}
              </Button>
            ) : null}
          </div>
        </div>
        {m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.imageUrl}
            alt={m.imageAlt}
            className="aspect-video w-full rounded object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded bg-surface-alt text-xs text-muted">
            {t("admin.marketing.hero.preview.noImage")}
          </div>
        )}
      </div>
    </Panel>
  );
}
