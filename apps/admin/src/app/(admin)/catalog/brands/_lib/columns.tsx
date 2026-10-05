import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Badge, IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col } from "@/components/table";
import { LogoNameCell } from "../../_components/LogoNameCell";
import { brandRowMenu, type BrandRowActions } from "./rowActions";
import type { Brand } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function brandColumns(t: T, actions: BrandRowActions) {
  const { onToggleExpand, expandedId } = actions;
  return [
    col.custom<Brand>(
      "",
      (b) => {
        const open = expandedId === b.id;
        return (
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpand(b.id)}
            aria-expanded={open}
            aria-label={t("admin.catalog.common.models")}
            title={t("admin.catalog.common.models")}
            className="text-muted hover:text-primary-600"
          >
            <ChevronRightIcon
              className={`h-4 w-4 transition-transform ${open ? "rotate-90 text-primary-600" : ""}`}
            />
          </IconButton>
        );
      },
      {
        id: "expand",
        minWidth: 72,
        fixed: true,
        align: "center",
        sortable: false,
      },
    ),
    col.custom<Brand>(
      t("admin.catalog.common.brand"),
      (b) => <LogoNameCell name={b.name} slug={b.slug} logo={b.logo} />,
      { grow: 3, minWidth: 200, sortKey: "name", sortType: "text" },
    ),
    col.badge<Brand>(t("common.status"), (b) => <Badge active={b.isActive} />, {
      sortKey: "isActive",
    }),
    col.rowMenu<Brand>(brandRowMenu(actions, t)),
  ];
}
