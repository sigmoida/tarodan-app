import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/**
 * Sipariş listesinin filtreleri. Her kod kendi alanında aranır (bir paket
 * numarası bir kullanıcı kodu değildir); toolbar araması hepsini birden tarar.
 * Sipariş durumu filtresi yok: durum sekme + alt sekmenin işidir.
 */
export const orderFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "text",
    name: "party",
    label: t("admin.operations.orders.filters.party"),
    placeholder: t("admin.operations.orders.filters.partyPlaceholder"),
  },
  {
    type: "text",
    name: "orderNumber",
    label: t("admin.operations.orders.orderNumber"),
  },
  {
    type: "text",
    name: "packageNumber",
    label: t("admin.operations.orders.filters.packageNumber"),
  },
  {
    type: "text",
    name: "groupNumber",
    label: t("admin.operations.orders.filters.groupNumber"),
  },
  {
    type: "text",
    name: "productQuery",
    label: t("admin.operations.orders.filters.productQuery"),
  },
  dateRangeField(t),
];

/**
 * Kontrolü olmayan deep-link parametreleri: kullanıcı / ürün detayından gelen
 * kapsam ve eski `?status=` bağlantıları (finans özetinin "teslim edilen").
 */
export const ORDER_DEEP_LINK_FILTERS = {
  userId: "",
  userRole: "",
  productId: "",
  status: "",
};
