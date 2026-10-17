import {
  GIB_NAME_SOURCE_I18N_KEYS,
  GIB_SELLER_KIND_I18N_KEYS,
  type AdminGibReportRow,
} from "@tarodan/types";
import type { TranslateFn } from "@/components/list/filters/types";

/**
 * Satıcı hücresi: yasal ad, altında adın NEREDEN çözüldüğü (güvenilirlik
 * yargısı için) ve satıcı türü. Ad çözülemediyse hücre boş görünür ama kaynak
 * satırı ("Çözülemedi") kaybolmaz; kullanıcı dosyası bağlantısı hep durur.
 */
export function gibSeller(t: TranslateFn, row: AdminGibReportRow) {
  const kind = t(GIB_SELLER_KIND_I18N_KEYS[row.sellerKind]);
  return {
    name: row.legalName ?? t(GIB_NAME_SOURCE_I18N_KEYS.none),
    secondary:
      row.legalName === null
        ? undefined
        : t(GIB_NAME_SOURCE_I18N_KEYS[row.legalNameSource]),
    tertiary: row.sellerDeleted
      ? `${kind} · ${t("admin.gibReport.deletedSeller")}`
      : kind,
    href: `/accounts/users/${row.sellerId}`,
  };
}
