import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { type Application, businessStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function applicationColumns(
  rowMenu: (a: Application) => RowActionItem[],
  t: T,
) {
  return [
    col.user<Application>(
      t("admin.accounts.sellerApplications.company"),
      (a) => ({ name: a.companyName, secondary: a.email }),
      {
        sortKey: "companyName",
        sortType: "text",
      },
    ),
    col.muted<Application>(
      t("admin.accounts.sellerApplications.contact"),
      "displayName",
    ),
    col.badge<Application>(
      t("common.status"),
      (a) => (
        <Badge
          status={a.businessStatus ?? "pending"}
          config={businessStatusConfig(t)}
        />
      ),
      { sortKey: "businessStatus", sortType: "text" },
    ),
    col.date<Application>(
      t("admin.accounts.sellerApplications.applicationDate"),
      "createdAt",
    ),
    col.rowMenu<Application>(rowMenu),
  ];
}
