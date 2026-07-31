import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col } from "@/components/table";
import { categoryRowMenu, type CategoryRowActions } from "./rowActions";
import type { Category } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function categoryColumns(t: T, actions: CategoryRowActions) {
  return [
    col.text<Category>(t("common.category"), "name", {
      grow: 3,
      minWidth: 300,
    }),
    col.muted<Category>(
      t("admin.catalog.categories.parentLabel"),
      (c) => c.parent?.name,
      { grow: 2, minWidth: 160 },
    ),
    col.custom<Category>(
      t("common.description"),
      (c) =>
        c.description ? (
          <p className="whitespace-normal break-words text-sm text-muted">
            {c.description}
          </p>
        ) : (
          <span className="text-muted">—</span>
        ),
      {
        grow: 4,
        minWidth: 320,
        sortKey: "description",
        sortType: "text",
      },
    ),
    col.number<Category>(
      t("admin.catalog.common.product"),
      (c) => c.productCount,
      { sortKey: "productCount" },
    ),
    col.number<Category>(
      t("admin.catalog.categories.activeProducts"),
      (c) => c.activeProducts,
    ),
    col.number<Category>(
      t("admin.catalog.categories.passiveProducts"),
      (c) => c.passiveProducts,
    ),
    col.number<Category>(
      t("admin.catalog.categories.pendingProducts"),
      (c) => c.pendingProducts,
    ),
    col.number<Category>(
      t("admin.catalog.common.collection"),
      (c) => c.collectionCount,
      { sortKey: "collectionCount" },
    ),
    col.badge<Category>(
      t("common.status"),
      (c) => <Badge active={c.isActive} />,
      {
        sortKey: "isActive",
      },
    ),
    col.rowMenu<Category>(categoryRowMenu(actions)),
  ];
}
