"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Toggle } from "@tarodan/ui";
import {
  CLIENT_PLATFORMS,
  type ClientPlatform,
  type HeroHomeVisibilityDto,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { useResourceList } from "@/components/list";
import { HERO_VISIBILITY_QUERY_KEY } from "../_hooks/useHeroHomeVisibility";
import {
  heroClientSummaries,
  type HeroClientState,
  type HeroClientSummary,
} from "../_lib/visibility";
import type { HeroSlide } from "../_lib/types";

const SUMMARY_VARIANT: Record<
  HeroClientState,
  "success" | "warning" | "outline"
> = {
  live: "success",
  switchOff: "outline",
  noLiveSlide: "warning",
  hiddenInApp: "warning",
};

/**
 * Ana sayfa sekmesinde tablonun üstündeki "Ana sayfa görünürlüğü" kartı: istemci
 * başına bir satır — anahtar + canlı özet ("3 slayt yayında" / "yayında slayt
 * yok" / "gizli: anahtar kapalı"). Değer gelene kadar anahtar kapalı + pasif
 * çizilir ("açık" varsayılanı gösterilmez); kayıt yanıtı önbelleğe hemen
 * yazılır, anahtar yeniden okuma beklenirken geri zıplamaz. Özet, liste ve
 * anahtar yüklenene kadar çizilmez (boş ilk durum yanlış özet çıkarmasın).
 */
export function HeroHomeVisibilityCard({
  visibility,
}: {
  visibility: HeroHomeVisibilityDto | undefined;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { rows, isLoading } = useResourceList<HeroSlide>();
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

  const summaries =
    visibility && !isLoading ? heroClientSummaries(rows, visibility) : null;
  const summaryOf = (platform: ClientPlatform) =>
    summaries?.find((s) => s.platform === platform);

  return (
    <SectionCard title={t("admin.marketing.hero.homeVisibility.title")}>
      <p className="mb-2 text-sm text-muted">
        {t("admin.marketing.hero.homeVisibility.help")}
      </p>
      <ul className="divide-y divide-border">
        {CLIENT_PLATFORMS.map((platform) => {
          const client = t(
            `admin.marketing.hero.homeVisibility.client.${platform}`,
          );
          const summary = summaryOf(platform);
          return (
            <li
              key={platform}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Toggle
                  checked={visibility?.[platform] ?? false}
                  onChange={(enabled) => save.mutate({ platform, enabled })}
                  disabled={!visibility || save.isPending}
                  label={t("admin.marketing.hero.homeVisibility.toggle", {
                    client,
                  })}
                />
                <span className="text-sm font-medium text-heading">
                  {client}
                </span>
              </div>
              {summary && <SummaryBadge summary={summary} />}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function SummaryBadge({ summary }: { summary: HeroClientSummary }) {
  const t = useTranslations();
  return (
    <Badge variant={SUMMARY_VARIANT[summary.state]} size="sm">
      {t(`admin.marketing.hero.homeVisibility.summary.${summary.state}`, {
        count: summary.liveCount,
      })}
    </Badge>
  );
}
