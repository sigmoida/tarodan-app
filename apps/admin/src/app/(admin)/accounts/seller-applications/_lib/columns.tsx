import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { type Application, businessStatusConfig } from "./types";

export function applicationColumns(
  rowMenu: (a: Application) => RowActionItem[],
) {
  return [
    col.user<Application>(
      "Firma",
      (a) => ({ name: a.companyName, secondary: a.email }),
      {
        sortKey: "companyName",
        sortType: "text",
      },
    ),
    col.muted<Application>("Yetkili", "displayName"),
    col.badge<Application>(
      "Durum",
      (a) => (
        <Badge
          status={a.businessStatus ?? "pending"}
          config={businessStatusConfig}
        />
      ),
      { sortKey: "businessStatus", sortType: "text" },
    ),
    col.date<Application>("Başvuru Tarihi", "createdAt"),
    col.rowMenu<Application>(rowMenu),
  ];
}
