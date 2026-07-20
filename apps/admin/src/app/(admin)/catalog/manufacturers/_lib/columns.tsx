import Image from "next/image";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, TruncatedText, Empty } from "@/components/table";
import { manufacturerRowMenu, type ManufacturerRowActions } from "./rowActions";
import type { Manufacturer } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function manufacturerColumns(t: T, actions: ManufacturerRowActions) {
  return [
    col.custom<Manufacturer>(
      t("admin.catalog.common.manufacturer"),
      (m) => (
        <div className="flex min-w-0 items-center gap-3">
          {m.logo ? (
            <Image
              src={m.logo}
              alt={m.name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg bg-surface-alt object-contain"
            />
          ) : (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-border-subtle font-bold text-muted">
              {m.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <TruncatedText className="font-medium text-heading">
              {m.name}
            </TruncatedText>
            <TruncatedText className="text-xs text-muted">
              {m.slug}
            </TruncatedText>
          </div>
        </div>
      ),
      { grow: 3, minWidth: 200, sortKey: "name", sortType: "text" },
    ),
    col.text<Manufacturer>(t("admin.catalog.common.country"), (m) => m.country),
    col.custom<Manufacturer>(t("admin.catalog.common.website"), (m) =>
      m.website ? (
        <a
          href={m.website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-info-600 hover:underline"
        >
          <GlobeAltIcon className="h-4 w-4" />
          {t("admin.catalog.manufacturers.visit")}
        </a>
      ) : (
        <Empty />
      ),
    ),
    col.badge<Manufacturer>(t("common.status"), (m) => (
      <Badge active={m.isActive} />
    )),
    col.rowMenu<Manufacturer>(manufacturerRowMenu(actions)),
  ];
}
