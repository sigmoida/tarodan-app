import type { AdminCancelReasonCode } from "@tarodan/types";

/**
 * Platform (admin) takas iptalinin taraf duyurusu. Gerekçe yalnız katalog
 * KODUDUR — bildirimci onu alıcının dilinde etikete çevirir. Adminin iç notu
 * bu sözleşmede bilinçli olarak YOKTUR: taraflara giden hiçbir yük onu
 * taşıyamaz.
 */
export interface TradePlatformCancelNotice {
  tradeId: string;
  tradeNumber: string;
  reasonCode: AdminCancelReasonCode;
  /** Her iki taraf; `refundAmount` 0 ise o tarafın iadesi yoktur. */
  parties: ReadonlyArray<{ userId: string; refundAmount: number }>;
}
