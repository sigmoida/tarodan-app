import { Button } from "@tarodan/ui";
import { col } from "@/components/table";
import { type SearchItem, type AdjustAction, fmt } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface TimeAdjustColumnProps {
  minutes: number;
  days: number;
  onAdjust: (item: SearchItem, action: AdjustAction, value: number) => void;
}

export function timeAdjustColumns(
  { minutes, days, onAdjust }: TimeAdjustColumnProps,
  t: T,
) {
  return [
    col.custom<SearchItem>(
      t("admin.system.testTools.record"),
      (item) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-heading">{item.label}</div>
          <div className="truncate text-xs text-subtle">{item.id}</div>
        </div>
      ),
      { sortKey: "label", sortType: "text" },
    ),
    col.muted<SearchItem>(t("common.status"), (item) => item.status ?? "—", {
      sortKey: "status",
    }),
    col.custom<SearchItem>(t("admin.system.testTools.dates"), (item) => (
      <div className="space-y-0.5">
        {Object.entries(item.dates).map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="text-muted">{k}:</span> {fmt(v, t)}
          </div>
        ))}
      </div>
    )),
    col.custom<SearchItem>(
      t("admin.system.testTools.action"),
      (item) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAdjust(item, "expire_now", 0)}
          >
            {t("admin.system.testTools.expireNow")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAdjust(item, "set_minutes", minutes)}
          >
            {t("admin.system.testTools.minutesAfter", { count: minutes })}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAdjust(item, "backdate_days", days)}
          >
            {t("admin.system.testTools.daysBack", { count: days })}
          </Button>
        </div>
      ),
      { grow: 3, minWidth: 260 },
    ),
  ];
}
