import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col } from "@/components/table";
import { MaskedValue } from "@/components/MaskedValue";
import { actorLabel, sourceLabel, type DeletedIdentity } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Kimlik numaraları ve IBAN varsayılan olarak MASKELİ (admin/CLAUDE.md §9):
 * bu ekran yüksek trafikli değil ama içeriği ham TCKN. CSV dışa aktarımı
 * bilinçli bir eylem olduğu için `exportValue` ham değeri verir.
 */
function maskedColumn(
  header: string,
  get: (r: DeletedIdentity) => string | null,
  sortKey: string,
) {
  return col.custom<DeletedIdentity>(
    header,
    (r) => {
      const value = get(r);
      return value ? <MaskedValue value={value} /> : <span>—</span>;
    },
    {
      minWidth: 190,
      sortKey,
      sortType: "text",
      exportValue: (r) => get(r as DeletedIdentity) ?? "",
    },
  );
}

export function deletedIdentityColumns(t: T) {
  return [
    col.code<DeletedIdentity>(
      t("admin.users.userId"),
      (r) => r.adminCode ?? "—",
      { minWidth: 130, sortKey: "adminCode", sortType: "text" },
    ),
    col.user<DeletedIdentity>(
      t("admin.deletedIdentities.columnUser"),
      (r) => ({
        name: r.displayName ?? r.username,
        secondary: r.email ?? r.username,
      }),
      { minWidth: 320, sortKey: "displayName", sortType: "text" },
    ),
    col.text<DeletedIdentity>(
      t("admin.deletedIdentities.phone"),
      (r) => r.phone ?? "—",
      { minWidth: 160, sortKey: "phone", sortType: "text" },
    ),
    maskedColumn(
      t("admin.deletedIdentities.nationalId"),
      (r) => r.nationalId,
      "nationalId",
    ),
    maskedColumn(t("admin.deletedIdentities.taxId"), (r) => r.taxId, "taxId"),
    col.text<DeletedIdentity>(
      t("admin.deletedIdentities.companyName"),
      (r) => r.companyName ?? "—",
      { minWidth: 200, sortKey: "companyName", sortType: "text" },
    ),
    col.muted<DeletedIdentity>(
      t("admin.deletedIdentities.city"),
      (r) =>
        [r.addressCity, r.addressDistrict].filter(Boolean).join(" / ") || "—",
      { minWidth: 180, sortKey: "addressCity", sortType: "text" },
    ),
    col.badge<DeletedIdentity>(
      t("admin.deletedIdentities.wasSeller"),
      (r) => (
        <Badge variant={r.wasSeller ? "warning" : "default"}>
          {r.wasSeller ? t("common.yes") : t("common.no")}
        </Badge>
      ),
      { sortKey: "wasSeller", sortType: "text" },
    ),
    col.date<DeletedIdentity>(
      t("admin.deletedIdentities.deletedAt"),
      (r) => r.deletedAt,
      { sortKey: "deletedAt", sortType: "date" },
    ),
    col.badge<DeletedIdentity>(
      t("admin.deletedIdentities.deletedBy"),
      (r) => <Badge>{actorLabel(t, r.deletedByActor)}</Badge>,
      { sortKey: "deletedByActor", sortType: "text" },
    ),
    col.badge<DeletedIdentity>(
      t("admin.deletedIdentities.source"),
      (r) => (
        <Badge variant={r.source === "backfill" ? "default" : "success"}>
          {sourceLabel(t, r.source)}
        </Badge>
      ),
      { sortKey: "source", sortType: "text" },
    ),
    col.date<DeletedIdentity>(
      t("admin.deletedIdentities.retainUntil"),
      (r) => r.retainUntil,
      { sortKey: "retainUntil", sortType: "date" },
    ),
  ];
}
