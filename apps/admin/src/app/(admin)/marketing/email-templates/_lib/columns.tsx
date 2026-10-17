import { col } from "@/components/table";
import { templateRowMenu } from "./rowActions";
import type { TemplateListItem } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function templateColumns(onEdit: (key: string) => void, t: T) {
  return [
    col.text<TemplateListItem>(t("admin.marketing.emailTemplates.key"), "key", {
      minWidth: 200,
    }),
    col.title<TemplateListItem>(
      t("common.name"),
      (row) => ({ title: row.name }),
      { minWidth: 200, sortKey: "name", sortType: "text" },
    ),
    col.muted<TemplateListItem>(
      t("admin.marketing.emailTemplates.subject"),
      (row) => row.subject || t("common.default"),
      { minWidth: 240, sortKey: "subject", sortType: "text" },
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
