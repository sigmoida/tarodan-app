/**
 * İade Talebi detay sayfası için sade-Türkçe yönlendirme/etiket haritaları.
 * Saf veri — UI yok. page.tsx + RefundStatusStepper + RefundNextActionPanel kullanır.
 */

/** Yaşam döngüsü aşamaları (stepper sırası). */
export const REFUND_LIFECYCLE = [
  "Talep alındı",
  "İnceleme",
  "İade kargosu",
  "Ürün yolda",
  "Ürün satıcıda",
  "Para iade edildi",
] as const;

/** RefundRequestStatus → aktif aşama indeksi (REFUND_LIFECYCLE üzerinde). */
export const refundStatusPhase: Record<string, number> = {
  approved: 2,
  wait_for_delivery: 2,
  return_shipment_open: 2,
  return_in_transit: 3,
  return_delivered: 4,
  refunded: 5,
};

/** Akış dışı (terminal) durumlar — stepper'da kırmızı uç-kapağı gösterilir. */
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
  /** true ise adminin elle bir işlem yapması gerekir (aksiyon butonu görünür). */
  actionNeeded: boolean;
}

/** Her durum için "şimdi ne yapmalısınız?" metni. */
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

/** İade kargosunu kim öder — sade Türkçe etiket + açıklama. */
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

/** İşlem geçmişi (audit) action kodu → okunabilir etiket + aktör. */
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
