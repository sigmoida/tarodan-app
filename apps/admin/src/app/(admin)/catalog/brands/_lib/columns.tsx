import Image from "next/image";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Badge, IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, TruncatedText } from "@/components/table";
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
      (b) => (
        <div className="flex min-w-0 items-center gap-3">
          {b.logo ? (
            <Image
              src={b.logo}
              alt={b.name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg bg-surface-alt object-contain"
            />
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-border-subtle font-bold text-muted">
              {b.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <TruncatedText className="font-medium text-heading">
              {b.name}
            </TruncatedText>
            <TruncatedText className="text-xs text-muted">
              {b.slug}
            </TruncatedText>
          </div>
        </div>
      ),
      { grow: 3, minWidth: 200, sortKey: "name", sortType: "text" },
    ),
    col.badge<Brand>(t("common.status"), (b) => <Badge active={b.isActive} />, {
      sortKey: "isActive",
    }),
    col.rowMenu<Brand>(brandRowMenu(actions)),
  ];
}
