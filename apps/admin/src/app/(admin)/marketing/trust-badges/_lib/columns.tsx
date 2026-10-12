import { StatusToggle } from "@/components/ActiveBadge";
import { col, type RowActionItem } from "@/components/table";
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
      { minWidth: 72, ...noSort },
    ),
    col.code<TrustBadge>(
      t("admin.marketing.trustBadges.columns.icon"),
      (b) => b.icon,
      noSort,
    ),
    col.text<TrustBadge>(
      t("common.title"),
      (b) => previewText(b.title, "tr"),
      noSort,
    ),
    col.muted<TrustBadge>(
      t("common.description"),
      (b) => previewText(b.description, "tr") || null,
      { grow: 4, minWidth: 220, ...noSort },
    ),
    col.custom<TrustBadge>(
      t("common.status"),
      (b) => (
        <StatusToggle
          active={b.isActive}
          busy={togglingId === b.id}
          onToggle={() => onToggle(b)}
        />
      ),
      { minWidth: 110, ...noSort },
    ),
    col.rowMenu<TrustBadge>(rowMenu),
  ];
}
