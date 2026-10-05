import { Badge } from "@tarodan/ui";
import {
  GIB_IDENTITY_KIND_I18N_KEYS,
  GIB_LISTING_STATUS_I18N_KEYS,
  type AdminGibReportRow,
} from "@tarodan/types";
import { MaskedValue } from "@/components/MaskedValue";
import { col } from "@/components/table";
import type { TranslateFn } from "@/components/list/filters/types";
import { ExternalUrlCell } from "../_components/ExternalUrlCell";
import { gibSeller } from "./rows";

/**
 * GİB raporu tablosu. Sıralanabilir kolonlar API'nin DMMF tabanlı
 * `resolveOrderBy`ına giden alan yollarıdır (`seller.createdAt` gibi).
 * Satır salt okunurdur.
 *
 * Kimlik numarası tabloda MASKELİ (`MaskedValue`: tıkla-göster) gelir ve
 * bilinçli olarak `exportValue` taşımaz — toolbar'ın istemci CSV'si onu
 * dışarı almaz; tam değer yalnız denetim kaydı bırakan sunucu dökümündedir.
 * Kimlik numarası satıcının banka hesabında / arşivde de yaşadığı için bu
 * kolon sunucuda sıralanamaz.
 */
export function gibReportColumns(t: TranslateFn) {
  return [
    col.date<AdminGibReportRow>(
      t("admin.gibReport.columns.publishedAt"),
      (r) => r.publishedAt,
      { sortKey: "publishedAt", sortType: "date" },
    ),
    col.text<AdminGibReportRow>(
      t("admin.gibReport.columns.title"),
      (r) => r.title,
      { minWidth: 220, sortKey: "title", sortType: "text" },
    ),
    col.money<AdminGibReportRow>(
      t("admin.gibReport.columns.price"),
      (r) => r.price,
      { sortKey: "price", sortType: "number" },
    ),
    col.badge<AdminGibReportRow>(
      t("admin.gibReport.columns.status"),
      (r) => <Badge>{t(GIB_LISTING_STATUS_I18N_KEYS[r.status])}</Badge>,
      {
        sortKey: "status",
        sortType: "text",
        exportValue: (r) =>
          t(GIB_LISTING_STATUS_I18N_KEYS[(r as AdminGibReportRow).status]),
      },
    ),
    col.muted<AdminGibReportRow>(
      t("admin.gibReport.columns.description"),
      (r) => r.description ?? "—",
      { minWidth: 240, sortable: false },
    ),
    col.custom<AdminGibReportRow>(
      t("admin.gibReport.columns.listingUrl"),
      (r) => <ExternalUrlCell href={r.listingUrl} label={r.productCode} />,
      { minWidth: 140, sortable: false },
    ),
    col.user<AdminGibReportRow>(
      t("admin.gibReport.columns.seller"),
      (r) => gibSeller(t, r),
      { sortKey: "seller.displayName", sortType: "text" },
    ),
    col.custom<AdminGibReportRow>(
      t("admin.gibReport.columns.identityNumber"),
      (r) =>
        r.identityNumber ? (
          <span className="flex flex-col gap-0.5">
            <MaskedValue value={r.identityNumber} />
            {r.identityKind && (
              <span className="text-xs text-muted">
                {t(GIB_IDENTITY_KIND_I18N_KEYS[r.identityKind])}
              </span>
            )}
          </span>
        ) : (
          <Badge variant="warning">{t("admin.gibReport.noIdentity")}</Badge>
        ),
      { minWidth: 200, sortable: false },
    ),
    col.date<AdminGibReportRow>(
      t("admin.gibReport.columns.membershipDate"),
      (r) => r.membershipDate,
      { sortKey: "seller.createdAt", sortType: "date" },
    ),
    col.custom<AdminGibReportRow>(
      t("admin.gibReport.columns.store"),
      (r) => <ExternalUrlCell href={r.profileUrl} label={r.storeName} />,
      { minWidth: 180, sortable: false },
    ),
  ];
}
