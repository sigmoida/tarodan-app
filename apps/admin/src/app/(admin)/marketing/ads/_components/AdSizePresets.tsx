"use client";

import { Alert, Button } from "@tarodan/ui";
import type { ContentPlatform } from "@tarodan/types";
import { useTranslations } from "next-intl";
import {
  customSizes,
  formatSizes,
  groupsAreIdentical,
  matchPreset,
  ratioMismatch,
  sizePresetGroups,
  sizeVsImageMismatch,
  type AdSize,
  type AdSizePreset,
  type AdSizeSource,
} from "../_lib/sizePresets";
import { positionLabels } from "../_lib/types";

interface Props {
  position: string;
  platform: ContentPlatform;
  /** Formdaki mevcut boyut. */
  size: AdSize;
  /** Görselin tarayıcıda okunan doğal boyutu (biliniyorsa). */
  natural: AdSize | null;
  /** Kayıtlı reklamın özgün boyutu (yeni reklamda null). */
  stored: AdSize | null;
  onPick: (size: AdSize, source: AdSizeSource) => void;
}

/**
 * Önerilen boyut çipleri (isteğe bağlı) + özel boyut çipi + oran uyarısı.
 * Boyutun kendisi görselden otomatik okunur; çipler yalnız öneridir.
 */
export function AdSizePresets({
  position,
  platform,
  size,
  natural,
  stored,
  onPick,
}: Props) {
  const t = useTranslations();
  const groups = sizePresetGroups(position, platform);
  if (groups.length === 0) return null;

  const grouped = !groupsAreIdentical(groups);
  const matched = matchPreset(position, platform, size);
  // Uyarılar görselin boyutuna bakar (çip seçimi uyarıyı gizlemez); görsel
  // okunmadıysa kayıtlı boyut vekildir.
  const image = natural ?? stored;
  const customs = customSizes(position, platform, [stored, natural]);
  const mismatch = image
    ? ratioMismatch({ position, platform, size: image })
    : null;
  const sizeMismatch = sizeVsImageMismatch({ size, image });

  const chips = (presets: readonly AdSizePreset[]) =>
    presets.map((s) => (
      <Button
        key={s.id}
        type="button"
        size="sm"
        variant={
          matched && matched.width === s.width && matched.height === s.height
            ? "primary"
            : "outline"
        }
        onClick={() => onPick({ width: s.width, height: s.height }, "preset")}
      >
        {t(`admin.marketing.ads.sizePreset.${s.id}`)} ({s.width}×{s.height})
      </Button>
    ));

  return (
    <div className="space-y-2 pt-1">
      <span className="block text-sm text-muted">
        {t("admin.marketing.ads.sizeRecommended")}
      </span>
      {grouped ? (
        groups.map((g) => (
          <div key={g.target} className="space-y-1">
            <span className="block text-xs font-medium text-subtle">
              {t(`admin.marketing.ads.sizeGroup.${g.target}`)}
            </span>
            <div className="flex flex-wrap gap-2">{chips(g.presets)}</div>
          </div>
        ))
      ) : (
        <div className="flex flex-wrap gap-2">{chips(groups[0].presets)}</div>
      )}

      {customs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customs.map((c) => (
            <Button
              key={`${c.width}x${c.height}`}
              type="button"
              size="sm"
              variant={
                size.width === c.width && size.height === c.height
                  ? "primary"
                  : "outline"
              }
              onClick={() =>
                onPick(
                  c,
                  natural &&
                    c.width === natural.width &&
                    c.height === natural.height
                    ? "image"
                    : "stored",
                )
              }
            >
              {t("admin.marketing.ads.sizeCustom", {
                width: c.width,
                height: c.height,
              })}
            </Button>
          ))}
        </div>
      )}

      {grouped && (
        <p className="text-xs text-muted">
          {t("admin.marketing.ads.sizeSplitHint")}
        </p>
      )}

      {image && mismatch && (
        <Alert variant="warning">
          {t("admin.marketing.ads.sizeRatioWarning", {
            width: image.width,
            height: image.height,
            position: positionLabels(t)[position] ?? position,
            sizes: formatSizes(mismatch.recommended),
            direction: mismatch.direction,
          })}
        </Alert>
      )}

      {image && sizeMismatch && (
        <Alert variant="warning">
          {t("admin.marketing.ads.sizeImageMismatch", {
            width: size.width,
            height: size.height,
            imageWidth: image.width,
            imageHeight: image.height,
          })}
        </Alert>
      )}
    </div>
  );
}
