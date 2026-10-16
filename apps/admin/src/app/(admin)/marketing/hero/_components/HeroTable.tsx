"use client";

import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { editDeleteActions, moveActions } from "@/components/table";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useRowReorder } from "@/hooks/useRowReorder";
import { heroColumns } from "../_lib/columns";
import { previewText } from "../_lib/preview";
import type { HeroSlide } from "../_lib/types";

export function HeroTable({ onEdit }: { onEdit: (slide: HeroSlide) => void }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const { onMove, positionOf, moving } = useRowReorder<HeroSlide>(
    "hero-slides",
    (ids) => adminApi.reorderHeroSlides(ids),
  );

  const toggle = useAdminMutation(
    (s: HeroSlide) => adminApi.updateHeroSlide(s.id, { isActive: !s.isActive }),
    {
      invalidates: ["hero-slides"],
      optimistic: {
        resources: "hero-slides",
        id: (s) => s.id,
        // Kapatılan slayt o an yayından düşer; açılanın yayın durumu pencereye
        // bağlıdır, onu sunucu yanıtı (yeniden okuma) söyler.
        patch: (s) => ({
          isActive: !s.isActive,
          isLive: s.isActive ? false : s.isLive,
        }),
      },
    },
  );
  // Son slayt da silinebilir: yerleşim boş kalırsa istemci hero'yu gizler.
  const del = useAdminMutation((id: string) => adminApi.deleteHeroSlide(id), {
    invalidates: ["hero-slides"],
    successMessage: t("admin.marketing.hero.deleted"),
  });

  const onDelete = async (slide: HeroSlide) => {
    await confirm({
      description: t("admin.marketing.hero.deleteConfirm", {
        title: previewText(slide.title, "tr"),
      }),
      destructive: true,
      onConfirm: () => del.mutateAsync(slide.id),
    });
  };

  const columns = heroColumns(
    {
      onToggle: (s) => toggle.mutate(s),
      togglingId: toggle.isPending ? toggle.variables?.id : undefined,
      rowMenu: (s) => {
        const [edit, remove] = editDeleteActions(s, { onEdit, onDelete }, t);
        return [
          edit,
          ...moveActions((d) => onMove(s, d), positionOf(s), t, moving),
          remove,
        ];
      },
    },
    t,
  );

  return (
    <ResourceList.Table
      columns={columns}
      emptyText={t("admin.marketing.hero.empty")}
    />
  );
}
