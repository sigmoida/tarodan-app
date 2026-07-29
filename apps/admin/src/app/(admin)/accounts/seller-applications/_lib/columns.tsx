import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { type Application, applicationStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function applicationColumns(
  rowMenu: (a: Application) => RowActionItem[],
  t: T,
) {
  return [
    col.user<Application>(
      t("admin.accounts.sellerApplications.company"),
      (a) => ({ name: a.companyTitle, secondary: a.companyEmail }),
      {
        sortKey: "companyTitle",
        sortType: "text",
      },
    ),
    col.muted<Application>(
      t("admin.accounts.sellerApplications.contact"),
      "authorizedFullName",
    ),
    col.badge<Application>(
      t("common.status"),
      (a) => <Badge status={a.status} config={applicationStatusConfig(t)} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.date<Application>(
      t("admin.accounts.sellerApplications.applicationDate"),
      "createdAt",
    ),
    col.rowMenu<Application>(rowMenu),
  ];
}
