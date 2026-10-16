"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Toggle } from "@tarodan/ui";
import {
  CLIENT_PLATFORMS,
  type ClientPlatform,
  type HeroHomeVisibilityDto,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  HERO_VISIBILITY_QUERY_KEY,
  useHeroHomeVisibility,
} from "../_hooks/useHeroHomeVisibility";

/**
 * Ana sayfa hero'sunu platform başına açıp kapatan iki anahtar (ana sayfa
 * sekmesinde, sayfa başlığında). Kapalı platformda hero gizlenir; slaytlar
 * silinmez. Değer gelene kadar anahtarlar kapalı + pasif çizilir ("açık"
 * varsayılanı gösterilmez); kayıt yanıtı önbelleğe hemen yazılır, anahtar
 * yeniden okuma beklenirken geri zıplamaz.
 */
export function HeroVisibilitySwitches() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data } = useHeroHomeVisibility();
  const save = useAdminMutation(
    ({ platform, enabled }: { platform: ClientPlatform; enabled: boolean }) => {
      // Yalnız değişen platform gider; öbürü sunucuda olduğu gibi kalır.
      const patch: Partial<HeroHomeVisibilityDto> = {};
      patch[platform] = enabled;
      return adminApi.updateHeroHomeVisibility(patch);
    },
    {
      invalidates: ["hero-slides"],
      successMessage: t("admin.marketing.hero.visibility.updated"),
      onSuccess: (res) =>
        queryClient.setQueryData<HeroHomeVisibilityDto>(
          HERO_VISIBILITY_QUERY_KEY,
          res.data,
        ),
    },
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-4">
        {CLIENT_PLATFORMS.map((platform) => {
          const label = t(`admin.marketing.hero.visibility.${platform}`);
          return (
            <div
              key={platform}
              className="flex items-center gap-2 text-sm text-heading"
            >
              <Toggle
                checked={data?.[platform] ?? false}
                onChange={(enabled) => save.mutate({ platform, enabled })}
                disabled={!data || save.isPending}
                label={label}
                size="sm"
              />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        {t("admin.marketing.hero.visibility.hint")}
      </p>
    </div>
  );
}
