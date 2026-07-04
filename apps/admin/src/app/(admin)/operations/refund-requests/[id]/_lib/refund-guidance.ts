/**
 * Plain-Turkish guidance/label maps for the Refund Request detail page.
 * Pure data — no UI. Used by page.tsx + RefundStatusStepper + RefundNextActionPanel.
 */

/**
 * Lifecycle phases (stepper order). The refund flow is now fully automatic —
 * there is no human "review/approval" step; a request is auto-approved as soon
 * as it is created and goes straight to the return shipment phase. (The "review" step was removed.)
 */
export const REFUND_LIFECYCLE = [
  "Talep alındı",
  "İade kargosu",
  "Ürün yolda",
  "Ürün satıcıda",
  "Para iade edildi",
] as const;

/** RefundRequestStatus → active phase index (into REFUND_LIFECYCLE). */
export const refundStatusPhase: Record<string, number> = {
  approved: 1,
  wait_for_delivery: 1,
  return_shipment_open: 1,
  return_in_transit: 2,
  return_delivered: 3,
  refunded: 4,
};

/** Off-flow (terminal) states — shown as a red end-cap in the stepper. */
export const refundTerminalStatuses = new Set(["rejected", "cancelled"]);

export type GuidanceVariant =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface RefundGuidance {
  variant: GuidanceVariant;
  title: string;
  description: string;
  /** If true, the admin must take a manual action (action button is shown). */
  actionNeeded: boolean;
}

/** The "what should you do now?" text for each state. */
export const statusGuidance: Record<string, RefundGuidance> = {
  approved: {
    variant: "info",
    title: "Talep onaylandı",
    description:
      "İade onaylandı; iade kargosu otomatik açılıyor. Süreç kendiliğinden ilerler, işlem gerekmez.",
    actionNeeded: false,
  },
  wait_for_delivery: {
    variant: "info",
    title: "Ürün teslimi bekleniyor",
    description:
      "İade onaylandı ancak ürün henüz alıcıya ulaşmadı. Ürün teslim edilince iade kargosu otomatik açılır. İşlem gerekmez.",
    actionNeeded: false,
  },
  return_shipment_open: {
    variant: "info",
    title: "İade kargosu hazır",
    description:
      "İade kargo etiketi oluşturuldu. Alıcı ürünü kargoya verdiğinde süreç otomatik ilerler. İşlem gerekmez.",
    actionNeeded: false,
  },
  return_in_transit: {
    variant: "info",
    title: "Ürün satıcıya dönüyor",
    description:
      "İade kargosu yolda. Ürün satıcıya ulaştığında para iadesi otomatik başlatılır. İşlem gerekmez.",
    actionNeeded: false,
  },
  return_delivered: {
    variant: "warning",
    title: "Para iadesi bekleniyor",
    description:
      "İade edilen ürün satıcıya ulaştı ama para iadesi otomatik tamamlanmadı. Aşağıdaki butonla manuel olarak tetikleyebilirsiniz.",
    actionNeeded: true,
  },
  refunded: {
    variant: "success",
    title: "Süreç tamamlandı",
    description:
      "Para iadesi başarıyla yapıldı ve bu talep kapandı. İşlem gerekmez.",
    actionNeeded: false,
  },
  rejected: {
    variant: "danger",
    title: "Talep reddedildi",
    description:
      "Bu iade talebi reddedildi ve kapatıldı. Para iadesi yapılmadı.",
    actionNeeded: false,
  },
  cancelled: {
    variant: "default",
    title: "Talep iptal edildi",
    description: "İade talebi iptal edildi. Herhangi bir işlem gerekmez.",
    actionNeeded: false,
  },
};

export const defaultGuidance: RefundGuidance = {
  variant: "default",
  title: "Durum",
  description:
    "Bu talebin güncel durumu için ayrıntıları aşağıda inceleyebilirsiniz.",
  actionNeeded: false,
};

export function guidanceForStatus(status: string): RefundGuidance {
  return statusGuidance[status] ?? defaultGuidance;
}

/** Who pays for the return shipping — plain Turkish label + description. */
export const payerLabels: Record<string, { label: string; helper: string }> = {
  buyer: {
    label: "Alıcı öder",
    helper: "Vazgeçme / keyfi iade durumunda iade kargo bedeli alıcıya aittir.",
  },
  seller: {
    label: "Satıcı öder",
    helper:
      "Haklı iade (hatalı, eksik ya da yanlış ürün) — iade kargo bedeli satıcıya aittir.",
  },
  platform: {
    label: "Platform öder",
    helper:
      "Kargo kaybı veya istisnai durum — iade kargo bedelini platform üstlenir.",
  },
};

/** Audit history action code → readable label + actor. */
const refundActionLabels: Record<string, { label: string; actor: string }> = {
  cancelled_by_buyer: { label: "Alıcı talebi iptal etti", actor: "Alıcı" },
  accepted_by_seller: { label: "Satıcı talebi kabul etti", actor: "Satıcı" },
  rejected_by_seller: { label: "Satıcı talebi reddetti", actor: "Satıcı" },
  dispute_resolved_approve: {
    label: "İtiraz onaylandı (iade açıldı)",
    actor: "Admin",
  },
  dispute_resolved_reject: {
    label: "İtiraz reddedildi (talep kapatıldı)",
    actor: "Admin",
  },
  return_opened: { label: "İade kargosu açıldı", actor: "Sistem" },
  refund_completed: { label: "Para iadesi tamamlandı", actor: "Sistem" },
  policy_overridden: { label: "İade politikası güncellendi", actor: "Admin" },
  return_shipping_payer_changed: {
    label: "İade kargo tarafı değiştirildi",
    actor: "Admin",
  },
};

export function refundActionLabel(action: string): {
  label: string;
  actor: string;
} {
  return (
    refundActionLabels[action] ?? {
      label: action.replace(/_/g, " "),
      actor: "—",
    }
  );
}
