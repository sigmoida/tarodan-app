import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col } from "@/components/table";
import { categoryRowMenu, type CategoryRowActions } from "./rowActions";
import type { Category } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export function categoryColumns(t: T, actions: CategoryRowActions) {
  return [
    col.text<Category>(t("common.category"), "name", { minWidth: 200 }),
    col.muted<Category>(t("common.description"), (c) => c.description, {
      minWidth: 220,
      sortKey: "description",
    }),
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
