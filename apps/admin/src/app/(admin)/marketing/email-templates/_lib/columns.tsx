import { COL_WIDTH, col } from "@/components/table";
import { templateRowMenu } from "./rowActions";
import type { TemplateListItem } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function templateColumns(onEdit: (key: string) => void, t: T) {
  return [
    col.text<TemplateListItem>(t("admin.marketing.emailTemplates.key"), "key"),
    col.title<TemplateListItem>(
      t("common.name"),
      (row) => ({ title: row.name }),
      { sortKey: "name", sortType: "text" },
    ),
    col.muted<TemplateListItem>(
      t("admin.marketing.emailTemplates.subject"),
      (row) => row.subject || t("common.default"),
      { minWidth: COL_WIDTH.description, sortKey: "subject", sortType: "text" },
    ),
    col.status<TemplateListItem>(
      t("common.status"),
      (row) =>
        row.hasCustomBody
          ? {
              variant: "success",
              children: t("admin.marketing.emailTemplates.custom"),
            }
          : { variant: "outline", children: t("common.default") },
      { sortKey: "hasCustomBody", sortType: "number" },
    ),
    col.rowMenu<TemplateListItem>(templateRowMenu(onEdit, t)),
  ];
}
