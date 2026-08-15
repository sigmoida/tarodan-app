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
    variant: "primary",
    icon: CheckCircleIcon,
  },
  reserved: {
    label: t("status.product.reserved"),
    variant: "primary",
    icon: ClockIcon,
  },
  inactive: {
    label: t("status.product.inactive"),
    variant: "default",
    icon: XCircleIcon,
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

export type ListingAction =
  | "edit"
  | "boost"
  | "deactivate"
  | "delete"
  | "revise"
  | "relist"
  | "reservation-status"
  | "support"
  | "create-listing";

/** Ürün durumuna göre kartta sunulabilecek işlemlerin tek kaynağı. */
export function getListingActions(listing: {
  status: string;
}): ListingAction[] {
  switch (listing.status) {
    case "active":
      return ["edit", "boost", "deactivate"];
    case "pending":
      return ["edit", "delete"];
    case "rejected":
      return ["revise", "delete"];
    case "inactive":
      return ["relist", "delete"];
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
  { value: "suspended", label: t("profile.listingStatus.askiyaAlinan") },
  { value: "reserved", label: "Rezerve" },
  { value: "sold", label: t("profile.listingStatus.satilan") },
  { value: "inactive", label: "Pasif" },
  { value: "deleted", label: t("profile.listingStatus.kaldirilan") },
];
