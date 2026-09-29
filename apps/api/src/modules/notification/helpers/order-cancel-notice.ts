/**
 * Kargo öncesi iptal duyurusunun gidebileceği taraflar. İptali yapan taraf
 * kendi eylemi için duyuru almaz: alıcı iptalinde yalnız satıcı ("kargoya
 * vermeyin"), platform iptalinde ikisi de, sistem iptallerinde ikisi de.
 */
export type OrderCancelNoticeParty = "buyer" | "seller";

export const ALL_ORDER_CANCEL_PARTIES: readonly OrderCancelNoticeParty[] = [
  "buyer",
  "seller",
];
