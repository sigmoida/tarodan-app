import type { AdminCancelReasonCode } from "@tarodan/types";

/**
 * Platform (admin) takas iptalinin TEK alıcıya, TEK kanaldan duyurusu.
 * Gerekçe yalnız katalog KODUDUR — bildirimci onu etikete çevirir. Adminin iç
 * notu bu sözleşmede bilinçli olarak YOKTUR: taraflara giden hiçbir yük onu
 * taşıyamaz.
 */
export interface TradePlatformCancelNotice {
  tradeId: string;
  tradeNumber: string;
  reasonCode: AdminCancelReasonCode;
  userId: string;
  /** 0 ise bu tarafın iadesi yoktur. */
  refundAmount: number;
  channel: "in_app" | "email";
}
