"use client";

import { Alert, Button } from "@tarodan/ui";
import type { ContentPlatform } from "@tarodan/types";
import { useTranslations } from "next-intl";
import {
  customSize,
  formatSizes,
  groupsAreIdentical,
  ratioMismatch,
  sizePresetGroups,
  type AdSize,
  type AdSizePreset,
} from "../_lib/sizePresets";
import { positionLabels } from "../_lib/types";

interface Props {
  position: string;
  platform: ContentPlatform;
  size: AdSize;
  onPick: (preset: AdSizePreset) => void;
}

/**
 * Önerilen boyut çipleri (isteğe bağlı) + özel boyut çipi + oran uyarısı.
 * Boyutun kendisi görselden otomatik okunur; çipler yalnız öneridir.
 */
export function AdSizePresets({ position, platform, size, onPick }: Props) {
  const t = useTranslations();
  const groups = sizePresetGroups(position, platform);
  if (groups.length === 0) return null;

  const grouped = !groupsAreIdentical(groups);
  const custom = customSize(position, platform, size);
  const mismatch = ratioMismatch({ position, platform, size });

  const chips = (presets: readonly AdSizePreset[]) =>
    presets.map((s) => (
      <Button
        key={s.id}
        type="button"
        size="sm"
        variant={
          size.width === s.width && size.height === s.height
            ? "primary"
            : "outline"
        }
        onClick={() => onPick(s)}
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
              {t(`admin.marketing.ads.platform.${g.target}`)}
            </span>
            <div className="flex flex-wrap gap-2">{chips(g.presets)}</div>
          </div>
        ))
      ) : (
        <div className="flex flex-wrap gap-2">{chips(groups[0].presets)}</div>
      )}

      {custom && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="primary">
            {t("admin.marketing.ads.sizeCustom", {
              width: custom.width,
              height: custom.height,
            })}
          </Button>
        </div>
      )}

      {grouped && (
        <p className="text-xs text-muted">
          {t("admin.marketing.ads.sizeSplitHint")}
        </p>
      )}

      {mismatch && (
        <Alert variant="warning">
          {t("admin.marketing.ads.sizeRatioWarning", {
            width: size.width,
            height: size.height,
            position: positionLabels(t)[position] ?? position,
            sizes: formatSizes(mismatch.recommended),
            direction: mismatch.direction,
          })}
        </Alert>
      )}
    </div>
  );
}
