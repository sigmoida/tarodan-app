/** @format */

import type { ComponentType, SVGProps } from "react";
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { BadgeVariant } from "@tarodan/ui";
import type { Translate } from "@/types/i18n";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Sekme/filtre değeri: süresi dolan ilanlar (status=inactive + inactiveReason=expired). */
export const EXPIRED_FILTER = "expired";

export interface ListingStatusMeta {
  label: string;
  variant: BadgeVariant;
  icon: Icon;
}

/** Listing status → Badge variant + label + icon (single source of truth). */
export const LISTING_STATUS = (
  t: Translate,
): Record<string, ListingStatusMeta> => ({
  pending: {
    label: t("profile.listingStatus.onayBekliyor"),
    variant: "warning",
    icon: ClockIcon,
  },
  active: { label: "Aktif", variant: "success", icon: CheckCircleIcon },
  rejected: { label: "Reddedildi", variant: "danger", icon: XCircleIcon },
  suspended: {
    label: t("profile.listingStatus.askiyaAlindi"),
    variant: "danger",
    icon: XCircleIcon,
  },
  sold: {
    label: t("profile.listingStatus.satildi"),
    variant: "default",
    icon: CheckCircleIcon,
  },
  reserved: {
    label: t("status.product.reserved"),
    variant: "default",
    icon: ClockIcon,
  },
  inactive: {
    label: t("status.product.inactive"),
    variant: "outline",
    icon: XCircleIcon,
  },
  expired: {
    label: t("profile.listingStatus.expired"),
    variant: "warning",
    icon: ClockIcon,
  },
  deleted: {
    label: t("profile.listingStatus.kaldirildi"),
    variant: "danger",
    icon: XCircleIcon,
  },
});

export const getListingStatus = (
  status: string,
  t: Translate,
): ListingStatusMeta => LISTING_STATUS(t)[status] ?? LISTING_STATUS(t).pending;

/** İlanın süresi dolmuş mu (pasif + neden `expired`)? Tek yüklem. */
export const isExpiredListing = (listing: {
  status: string;
  inactiveReason?: string | null;
}): boolean =>
  listing.status === "inactive" && listing.inactiveReason === EXPIRED_FILTER;

/** Rozet/etiket için etkin durum anahtarı: süresi dolan ilan "expired" gösterilir. */
export const listingStatusKey = (listing: {
  status: string;
  inactiveReason?: string | null;
}): string => (isExpiredListing(listing) ? EXPIRED_FILTER : listing.status);

/** Sekme değerinin `GET /products/my` sorgu parametreleri. */
export function listingFilterParams(filter: string): Record<string, string> {
  if (filter === EXPIRED_FILTER) {
    return { status: "inactive", inactiveReason: "expired" };
  }
  return filter && filter !== "all" ? { status: filter } : {};
}

export type ListingAction =
  | "edit"
  | "boost"
  | "deactivate"
  | "delete"
  | "revise"
  | "relist"
  | "renew"
  | "reservation-status"
  | "support"
  | "create-listing";

/** Ürün durumuna göre kartta sunulabilecek işlemlerin tek kaynağı. */
export function getListingActions(listing: {
  status: string;
  inactiveReason?: string | null;
}): ListingAction[] {
  switch (listing.status) {
    case "active":
      return ["edit", "boost", "deactivate"];
    case "pending":
      return ["edit", "delete"];
    case "rejected":
      return ["revise", "delete"];
    case "inactive":
      // Süresi dolan ilan tek tıkla yenilenir; diğer pasif ilan düzenleme
      // ekranından yeniden yayına gönderilir (admin onayına düşer).
      return isExpiredListing(listing)
        ? ["renew", "delete"]
        : ["relist", "delete"];
    case "reserved":
      return ["reservation-status"];
    case "sold":
      return ["relist"];
    case "suspended":
      return ["support", "delete"];
    case "deleted":
      return ["create-listing"];
    default:
      return [];
  }
}

export const FILTER_TABS = (t: Translate) => [
  { value: "all", label: t("profile.listingStatus.tumu") },
  { value: "pending", label: t("profile.listingStatus.onayBekleyen") },
  { value: "active", label: "Aktif" },
  { value: EXPIRED_FILTER, label: t("profile.expiredListings.tab") },
  { value: "suspended", label: t("profile.listingStatus.askiyaAlinan") },
  { value: "reserved", label: "Rezerve" },
  { value: "sold", label: t("profile.listingStatus.satilan") },
  { value: "inactive", label: "Pasif" },
  { value: "deleted", label: t("profile.listingStatus.kaldirilan") },
];
