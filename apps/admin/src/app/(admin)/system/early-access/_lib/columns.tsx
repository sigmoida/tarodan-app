import { StatusBadge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, type RowActionItem } from "@/components/table";
import { derivePinStatus, pinStatusConfig, type SiteAccessPin } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function pinColumns(
  t: T,
  getRowActions: (pin: SiteAccessPin) => RowActionItem[],
) {
  const statusConfig = pinStatusConfig(t);
  return [
    col.text<SiteAccessPin>(t("admin.earlyAccess.columns.label"), "label", {
      grow: 3,
      minWidth: 200,
    }),
    col.muted<SiteAccessPin>(
      t("admin.earlyAccess.columns.email"),
      (p) => p.email,
      { grow: 3, minWidth: 200 },
    ),
    col.code<SiteAccessPin>(t("admin.earlyAccess.columns.code"), "code", {
      minWidth: 130,
    }),
    col.badge<SiteAccessPin>(t("common.status"), (p) => (
      <StatusBadge status={derivePinStatus(p)} config={statusConfig} />
    )),
    col.custom<SiteAccessPin>(
      t("admin.earlyAccess.columns.usage"),
      (p) => (
        <span className="text-sm tabular-nums">
          {p.maxUses != null ? `${p.usedCount}/${p.maxUses}` : p.usedCount}
        </span>
      ),
      { sortKey: "usedCount", sortType: "number", minWidth: 100 },
    ),
    col.date<SiteAccessPin>(
      t("admin.earlyAccess.columns.lastUsedAt"),
      "lastUsedAt",
    ),
    col.date<SiteAccessPin>(
      t("admin.earlyAccess.columns.expiresAt"),
      "expiresAt",
    ),
    col.rowMenu<SiteAccessPin>(getRowActions),
  ];
}
