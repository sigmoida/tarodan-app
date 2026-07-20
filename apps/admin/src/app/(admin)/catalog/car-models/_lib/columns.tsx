import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, TruncatedText } from "@/components/table";
import { carModelRowMenu, type CarModelRowActions } from "./rowActions";
import type { CarModel } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function carModelColumns(t: T, actions: CarModelRowActions) {
  return [
    col.custom<CarModel>(
      t("admin.catalog.common.model"),
      (m) => (
        <div className="min-w-0">
          <TruncatedText className="font-medium text-heading">
            {m.name}
          </TruncatedText>
          <TruncatedText className="text-xs text-muted">{m.slug}</TruncatedText>
        </div>
      ),
      { grow: 3, minWidth: 180, sortKey: "name", sortType: "text" },
    ),
    col.text<CarModel>(t("admin.catalog.common.brand"), (m) => m.brand?.name, {
      sortKey: "brand.name",
    }),
    col.text<CarModel>(
      t("admin.catalog.common.year"),
      (m) =>
        m.yearStart || m.yearEnd
          ? `${m.yearStart ?? "?"} - ${m.yearEnd ?? "?"}`
          : undefined,
      { minWidth: 120, sortKey: "yearStart" },
    ),
    col.badge<CarModel>(
      t("common.status"),
      (m) => <Badge active={m.isActive} />,
      { sortKey: "isActive" },
    ),
    col.rowMenu<CarModel>(carModelRowMenu(actions)),
  ];
}
