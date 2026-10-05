import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, Empty } from "@/components/table";
import { TextLink } from "@/components/TextLink";
import { LogoNameCell } from "../../_components/LogoNameCell";
import { manufacturerRowMenu, type ManufacturerRowActions } from "./rowActions";
import type { Manufacturer } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function manufacturerColumns(t: T, actions: ManufacturerRowActions) {
  return [
    col.custom<Manufacturer>(
      t("admin.catalog.common.manufacturer"),
      (m) => <LogoNameCell name={m.name} slug={m.slug} logo={m.logo} />,
      { grow: 3, minWidth: 200, sortKey: "name", sortType: "text" },
    ),
    col.text<Manufacturer>(
      t("admin.catalog.common.country"),
      (m) => m.country,
      {
        sortKey: "country",
      },
    ),
    col.custom<Manufacturer>(
      t("admin.catalog.common.website"),
      (m) =>
        m.website ? (
          <TextLink href={m.website} external className="whitespace-nowrap">
            {t("admin.catalog.manufacturers.visit")}
          </TextLink>
        ) : (
          <Empty />
        ),
      { sortKey: "website" },
    ),
    col.badge<Manufacturer>(
      t("common.status"),
      (m) => <Badge active={m.isActive} />,
      { sortKey: "isActive" },
    ),
    col.rowMenu<Manufacturer>(manufacturerRowMenu(actions, t)),
  ];
}
