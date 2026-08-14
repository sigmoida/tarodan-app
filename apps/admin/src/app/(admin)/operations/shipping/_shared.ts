// `shipmentStatusConfig` (ShipmentStatus enum → label/variant) is NOT defined
// here — it lives in @tarodan/ui (shared status-configs) and is imported from
// there wherever needed. A local fork used to sit here and had drifted from the
// canonical labels/variants; it was removed.

import { useTranslations } from "next-intl";
import { fmtDate } from "@/lib/format";

type T = ReturnType<typeof useTranslations<never>>;

// Status filter options — shared by the Orders and Trades tabs.
export const statusOptions = (t: T): { value: string; label: string }[] => [
  { value: "all", label: t("common.all") },
  { value: "pending", label: t("common.pending") },
  {
    value: "label_created",
    label: t("admin.operations.shipping.status.labelCreated"),
  },
  { value: "picked_up", label: t("admin.operations.shipping.status.pickedUp") },
  {
    value: "in_transit",
    label: t("admin.operations.shipping.status.inTransit"),
  },
  {
    value: "at_delivery_branch",
    label: t("admin.operations.shipping.status.atBranch"),
  },
  {
    value: "out_for_delivery",
    label: t("admin.operations.shipping.status.outForDelivery"),
  },
  { value: "delivered", label: t("admin.operations.common.delivered") },
  { value: "failed", label: t("admin.operations.shipping.status.failed") },
  {
    value: "return_in_progress",
    label: t("admin.operations.shipping.status.returnInProgress"),
  },
  { value: "returned", label: t("admin.operations.shipping.status.returned") },
  {
    value: "cancelled",
    label: t("admin.operations.shipping.status.cancelled"),
  },
];

// ─── Trade direction (leg) options ───────────────────────────────────────────
export const legOptions = (t: T): { value: string; label: string }[] => [
  { value: "all", label: t("admin.operations.shipping.leg.all") },
  {
    value: "to_warehouse",
    label: t("admin.operations.shipping.leg.toWarehouse"),
  },
  {
    value: "from_warehouse",
    label: t("admin.operations.shipping.leg.fromWarehouse"),
  },
  { value: "return", label: t("admin.operations.shipping.leg.return") },
];

/** Trade leg code → readable direction label ("" / unknown → the raw code). */
export function legLabel(t: T, leg: string): string {
  const map: Record<string, string> = {
    to_warehouse: t("admin.operations.shipping.leg.toWarehouse"),
    from_warehouse: t("admin.operations.shipping.leg.fromWarehouse"),
    return: t("admin.operations.shipping.leg.return"),
  };
  return map[leg] || leg;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** "just now" / "5 min ago" / "3 hr ago" / "2 days ago" / full date */
export function formatRelative(t: T, iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t("admin.operations.shipping.time.justNow");
  if (min < 60) return t("admin.operations.shipping.time.minutesAgo", { min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("admin.operations.shipping.time.hoursAgo", { hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("admin.operations.shipping.time.daysAgo", { day });
  return fmtDate(d) ?? "—";
}

/** ISO date as tr-TR short date; "—" if empty/null */
export function formatDate(iso?: string | null): string {
  return fmtDate(iso) ?? "—";
}
