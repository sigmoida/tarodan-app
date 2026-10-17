import {
  COL_SIZE,
  COL_WIDTH,
  col,
  type RowActionItem,
} from "@/components/table";
import type { useTranslations } from "next-intl";
import { previewText } from "../../hero/_lib/preview";
import type { TrustBadge } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export interface TrustBadgeColumnProps {
  onToggle: (badge: TrustBadge) => void;
  togglingId?: string;
  rowMenu: (badge: TrustBadge) => RowActionItem[];
}

/** Sütunlar sıralanamaz: liste `displayOrder` sırasında gelir (yukarı/aşağı bu sıraya göre). */
export function trustBadgeColumns(
  { onToggle, togglingId, rowMenu }: TrustBadgeColumnProps,
  t: T,
) {
  const noSort = { sortable: false } as const;
  return [
    col.number<TrustBadge>(
      t("admin.marketing.trustBadges.columns.order"),
      (b) => b.displayOrder,
      { ...COL_SIZE.count, ...noSort },
    ),
    col.text<TrustBadge>(
      t("admin.marketing.trustBadges.columns.icon"),
      (b) => b.icon,
      { ...COL_SIZE.label, ...noSort },
    ),
    col.title<TrustBadge>(
      t("common.title"),
      (b) => ({ title: previewText(b.title, "tr") }),
      noSort,
    ),
    col.muted<TrustBadge>(
      t("common.description"),
      (b) => previewText(b.description, "tr") || null,
      { minWidth: COL_WIDTH.description, ...noSort },
    ),
    col.status<TrustBadge>(
      t("admin.marketing.hero.columns.ios"),
      (b) =>
        b.hideOnIos
          ? {
              variant: "outline",
              children: t("admin.marketing.hero.hiddenOnIos"),
            }
          : null,
      noSort,
    ),
    col.toggle<TrustBadge>(
      t("common.status"),
      (b) => ({
        checked: b.isActive,
        onChange: () => onToggle(b),
        disabled: togglingId === b.id,
        label: `${t("common.status")}: ${previewText(b.title, "tr")}`,
        stateText: b.isActive ? t("common.active") : t("common.inactive"),
      }),
      noSort,
    ),
    col.rowMenu<TrustBadge>(rowMenu),
  ];
}
