import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { templateRowMenu } from "./rowActions";
import type { TemplateListItem } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function templateColumns(onEdit: (key: string) => void, t: T) {
  return [
    col.code<TemplateListItem>(t("admin.marketing.emailTemplates.key"), "key"),
    col.text<TemplateListItem>(t("common.name"), "name", {
      grow: 2,
      minWidth: 160,
    }),
    col.muted<TemplateListItem>(
      t("admin.marketing.emailTemplates.subject"),
      (row) => row.subject || t("common.default"),
      {
        grow: 3,
        minWidth: 200,
        sortKey: "subject",
        sortType: "text",
      },
    ),
    col.badge<TemplateListItem>(
      t("common.status"),
      (row) =>
        row.hasCustomBody ? (
          <Badge variant="success" size="sm">
            {t("admin.marketing.emailTemplates.custom")}
          </Badge>
        ) : (
          <Badge variant="secondary" size="sm">
            {t("common.default")}
          </Badge>
        ),
      { sortKey: "hasCustomBody", sortType: "number" },
    ),
    col.rowMenu<TemplateListItem>(templateRowMenu(onEdit, t)),
  ];
}
