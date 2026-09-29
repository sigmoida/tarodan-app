import {
  CancellationActor,
  OrderCancellationReason,
  RefundReason,
} from "@prisma/client";
import type { RefundRequestActor } from "../../payment/helpers/refund-attempt-actor";
import type { OrderCancelNoticeParty } from "../../notification/helpers/order-cancel-notice";
import {
  resolveCancellationPolicy,
  resolvePlatformCancellationPolicy,
  type RefundPolicyDecision,
} from "./refund-financial-policy";
import type { RefundFaultPartyV2 } from "./refund-financial-policy-v2";

/**
 * Kargo öncesi iptali KİMİN başlattığı — para yolu tektir
 * (RefundCreationService.executePreShipmentCancellation); iptal edenler
 * arasındaki bütün fark bu nesnede toplanır. Yeni bir iptal eden (ör. satıcı)
 * eklemek yeni bir spec üreticisi yazmaktır, çekirdeğe dal eklemek değil.
 */
export interface PreShipmentCancellationSpec {
  /**
   * İptali başlatan taraf = siparişin iptal aktörü (`Order.cancelledBy`).
   * Çekirdek bunu olduğu gibi processRefund'a geçirir ve talebin
   * metadata'sına işler; ayrı bir eşleme yoktur.
   */
  initiator: RefundRequestActor;
  /**
   * RefundRequest.requesterId — talep HER ZAMAN alıcı adına açılır: alıcının
   * iade listesi ve iade e-postaları bu alana bakar.
   */
  requesterId: string;
  /** Eylemi yapan (incelemeye düşen talebin geçmiş kaydı). */
  actorId: string;
  /** İadeyi kesinleştiren: alıcı iptalinde otomatik ("system"), platformda admin. */
  decidedBy: string;
  /** Order.cancellationReasonCode — platform iptalinde yapılandırılmış neden yok. */
  reasonCode: OrderCancellationReason | null;
  /** RefundRequest.description (alıcının açıklaması / admin gerekçesi). */
  description: string | null;
  /** Order.cancelReason — iptal e-postasında iki tarafa gösterilir. */
  cancelReason: string;
  /** Politika snapshot'ının ve inceleme bildiriminin neden etiketi. */
  snapshotReason: string;
  /** v1 (legacy) politika kararı — `hasShipped: false` varsayımıyla. */
  policy: RefundPolicyDecision;
  /** RefundRequest.reason — talebin iddia edilen nedeni. */
  requestReason: RefundReason;
  /** v2 kesinleşmiş neden + kusur tarafı (bileşen hesabını belirler). */
  resolvedReason: RefundReason;
  faultParty: RefundFaultPartyV2;
  /** İade geçmişine yazılan ayrıntı. */
  historyDetails: Record<string, unknown>;
  /**
   * İptal duyurusunun (in-app + e-posta) gideceği taraflar — iptali yapan
   * taraf kendi eylemi için duyuru almaz: alıcı iptalinde yalnız satıcı
   * ("kargoya vermeyin"), platform iptalinde alıcı ve satıcı.
   */
  notifyParties: readonly OrderCancelNoticeParty[];
}

/**
 * Alıcı iptali — davranış birebir korunur: gecikme satıcı kusurudur (kargo ve
 * koruma bedeli iade edilir), diğer yapılandırılmış nedenler alıcı caymasıdır.
 */
export function buyerCancellationSpec(
  buyerId: string,
  reasonCode: OrderCancellationReason,
  description?: string,
): PreShipmentCancellationSpec {
  const sellerFault = reasonCode === OrderCancellationReason.delivery_delayed;
  const trimmed = description?.trim() || null;
  return {
    initiator: CancellationActor.buyer,
    requesterId: buyerId,
    actorId: buyerId,
    decidedBy: "system",
    reasonCode,
    description: trimmed,
    cancelReason: trimmed || reasonCode,
    snapshotReason: reasonCode,
    policy: resolveCancellationPolicy(reasonCode, { hasShipped: false }),
    requestReason: sellerFault ? RefundReason.other : RefundReason.changed_mind,
    resolvedReason: sellerFault
      ? RefundReason.delivery_delayed
      : RefundReason.changed_mind,
    faultParty: sellerFault ? "seller" : "buyer",
    historyDetails: { reasonCode },
    notifyParties: ["seller"],
  };
}

/** Platform iptalinin politika snapshot'ındaki neden etiketi. */
export const PLATFORM_CANCELLATION_REASON = "platform_cancellation";

/** Platform iptalinin v2 kusur tarafı — iptal ve önizlemesi aynı değeri okur. */
export const PLATFORM_CANCELLATION_FAULT_PARTY: RefundFaultPartyV2 = "platform";

/**
 * Platform (admin) iptali — kusur platformda: alıcı ödediği her kalemi geri
 * alır (ürün, alıcı komisyonu + hizmet bedeli, paketi kapatıyorsa gidiş
 * kargosu), satıcı kesintileri terslenir, kupon hakkı geri verilir.
 */
export function platformCancellationSpec(
  buyerId: string,
  adminId: string,
  reason: string,
): PreShipmentCancellationSpec {
  const trimmed = reason.trim();
  return {
    initiator: CancellationActor.platform,
    requesterId: buyerId,
    actorId: adminId,
    decidedBy: adminId,
    reasonCode: null,
    description: trimmed || null,
    cancelReason: trimmed,
    snapshotReason: PLATFORM_CANCELLATION_REASON,
    policy: resolvePlatformCancellationPolicy(),
    requestReason: RefundReason.other,
    resolvedReason: RefundReason.other,
    faultParty: PLATFORM_CANCELLATION_FAULT_PARTY,
    historyDetails: { initiator: CancellationActor.platform, reason: trimmed },
    notifyParties: ["buyer", "seller"],
  };
}
