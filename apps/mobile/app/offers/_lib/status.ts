// Teklif durum haritası + formatlama yardımcıları — TEK kaynak.
// (Ekran/kart/modaller buradan okur; drift riskini önler.)
import type { TFunction } from "i18next";
import { theme } from "@tarodan/ui-native";
import { Ionicons } from "@expo/vector-icons";
import { transformImageUrl } from "@/utils/imageUrl";
import type { Offer, OfferStatus } from "./types";

const { colors } = theme;

export const STATUS_CONFIG: Record<
  OfferStatus,
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  pending: {
    label: "Bekliyor",
    color: colors.warning[600]!,
    bg: colors.warning[100]!,
    icon: "time-outline",
  },
  accepted: {
    label: "Kabul Edildi",
    color: colors.success[600]!,
    bg: colors.success[100]!,
    icon: "checkmark-circle-outline",
  },
  rejected: {
    label: "Reddedildi",
    color: colors.danger[600]!,
    bg: colors.danger[100]!,
    icon: "close-circle-outline",
  },
  countered: {
    label: "Karşı Teklif",
    color: colors.info[600]!,
    bg: colors.info[100]!,
    icon: "swap-horizontal-outline",
  },
  cancelled: {
    label: "İptal Edildi",
    color: colors.gray[500]!,
    bg: colors.gray[100]!,
    icon: "close-circle-outline",
  },
  expired: {
    label: "Süresi Doldu",
    color: colors.gray[500]!,
    bg: colors.gray[100]!,
    icon: "alert-circle-outline",
  },
  payment_expired: {
    label: "Ödeme Süresi Doldu",
    color: colors.danger[600]!,
    bg: colors.danger[100]!,
    icon: "alert-circle-outline",
  },
};

/** Bilinmeyen/yeni bir backend durumu için güvenli fallback. */
export function statusConfig(status: OfferStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.expired;
}

export function getProductImage(product: Offer["product"]): string {
  const img = product.images?.[0];
  const src = img?.cardUrl ?? product.imageUrl;
  return transformImageUrl(src);
}

export function getTimeRemaining(expiresAt: string): string | null {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)} gün`;
  return `${hours}s ${minutes}d`;
}

export function formatTimeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return t("time.ago.justNow");
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return t("time.ago.justNow");
  if (m < 60) return t("time.ago.minutes", { count: m });
  if (h < 24) return t("time.ago.hours", { count: h });
  if (d < 30) return t("time.ago.days", { count: d });
  const mo = Math.floor(d / 30);
  return t("time.ago.months", { count: mo });
}

export function formatPrice(n: number): string {
  return `₺${n.toLocaleString("tr-TR")}`;
}
