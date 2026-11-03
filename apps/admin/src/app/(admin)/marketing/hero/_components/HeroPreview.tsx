"use client";

import { useState } from "react";
import { useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { mediaRatios, type MediaRatio } from "@tarodan/design-tokens";
import { Alert, Button, cn } from "@tarodan/ui";
import { Panel } from "@/components/detail/Panel";
import type { LocaleLang } from "@/lib/localized-form";
import {
  CROP_WARN_PERCENT,
  MOBILE_IMAGE_SPEC,
  cropLossFor,
} from "../_lib/image-spec";
import { heroPreviewModel } from "../_lib/preview";
import type { HeroFormValues } from "../_lib/types";

interface FrameProps {
  label: string;
  imageUrl: string;
  imageAlt: string;
  box: MediaRatio;
  /** Tailwind aspect utility of the box (static string so it is generated). */
  aspectClass: string;
  /** Extra hint appended to the crop warning. */
  fixHint?: string;
}

/**
 * One image box as the real hero draws it (`object-cover`, centred), plus a
 * non-blocking warning when the loaded image loses more than the threshold
 * per side.
 */
function ImageFrame({
  label,
  imageUrl,
  imageAlt,
  box,
  aspectClass,
  fixHint,
}: FrameProps) {
  const t = useTranslations();
  const [natural, setNatural] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const loss =
    natural && natural.url === imageUrl
      ? cropLossFor(natural.width, natural.height, box)
      : 0;

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={imageAlt}
          className={cn(
            "w-full rounded object-cover object-center",
            aspectClass,
          )}
          onLoad={(e) =>
            setNatural({
              url: imageUrl,
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
        />
      ) : (
        <div
          className={cn(
            "flex w-full items-center justify-center rounded bg-surface-alt text-xs text-muted",
            aspectClass,
          )}
        >
          {t("admin.marketing.hero.preview.noImage")}
        </div>
      )}
      {loss > CROP_WARN_PERCENT ? (
        <Alert variant="warning" className="p-2 text-xs">
          {t("admin.marketing.hero.preview.cropWarning", {
            percent: Math.round(loss),
          })}
          {fixHint ? ` ${fixHint}` : ""}
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Formdan beslenen sadeleştirilmiş hero maketi: başlık, alt başlık, iki düğme
 * ve görselin telefon ile masaüstü/tablet çerçevesindeki gerçek kırpılışı.
 * Yalnız yerleşimi gösterir; gerçek hero'nun yerine geçmez.
 */
export function HeroPreview({ lang }: { lang: LocaleLang }) {
  const t = useTranslations();
  const values = useWatch() as Partial<HeroFormValues>;
  const m = heroPreviewModel(values, lang);
  const [primary, secondary] = m.buttons;
  const phoneUrl = m.mobileImageUrl || m.imageUrl;

  return (
    <Panel tone="muted" className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t("admin.marketing.hero.preview.title")}
      </p>
      <div className="space-y-4 rounded-lg bg-surface p-4">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ImageFrame
            label={t("admin.marketing.hero.preview.phone")}
            imageUrl={phoneUrl}
            imageAlt={m.imageAlt}
            box={mediaRatios.heroCompact}
            aspectClass="aspect-hero-compact"
            fixHint={
              m.mobileImageUrl
                ? undefined
                : t("admin.marketing.hero.preview.cropFixMobile", {
                    ratio: MOBILE_IMAGE_SPEC.ratioLabel,
                    width: MOBILE_IMAGE_SPEC.width,
                    height: MOBILE_IMAGE_SPEC.height,
                  })
            }
          />
          <ImageFrame
            label={t("admin.marketing.hero.preview.desktop")}
            imageUrl={m.imageUrl}
            imageAlt={m.imageAlt}
            box={mediaRatios.heroSplit}
            aspectClass="aspect-hero-split"
          />
        </div>
      </div>
    </Panel>
  );
}
