"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import { useResourceList } from "@/components/list";
import { useHeroHomeVisibility } from "../_hooks/useHeroHomeVisibility";
import { heroHiddenNotes } from "../_lib/visibility";
import type { HeroSlide } from "../_lib/types";

/**
 * Ana sayfa sekmesinde: hero'nun gizli olduğu her platform için bilgi notu
 * (anahtar kapalı ya da o platformda yayında slayt yok). Liste ya da anahtar
 * yüklenirken gösterilmez — boş ilk durum yanlış not çıkarmasın.
 */
export function HeroHiddenNotes() {
  const t = useTranslations();
  const { rows, isLoading } = useResourceList<HeroSlide>();
  const { data: visibility } = useHeroHomeVisibility();
  if (isLoading || !visibility) return null;

  const notes = heroHiddenNotes(rows, visibility);
  if (notes.length === 0) return null;
  return (
    <div className="space-y-2">
      {notes.map(({ platform, reason }) => (
        <Alert key={platform} variant="info">
          {t(`admin.marketing.hero.hiddenOn.${reason}`, {
            platform: t(`admin.marketing.hero.clientName.${platform}`),
          })}
        </Alert>
      ))}
    </div>
  );
}
