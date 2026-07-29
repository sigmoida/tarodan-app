import { ListBulletIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface PayoutSummary {
  totalPending: number;
  totalReleased: number;
  countHeld: number;
  countReleased: number;
  nextReleases: Array<{
    id: string;
    orderId: string;
    amount: number;
    releaseAt: string | null;
    sellerId: string;
  }>;
}

export interface PayoutTransaction {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  amount: number;
  status: string;
  releaseAt: string | null;
  releasedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ScheduleItem {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  amount: number;
  releaseAt: string | null;
  createdAt: string;
}

export const payoutTabs = (t: T) => [
  {
    key: "transactions",
    label: t("admin.finance.payouts.transactionHistory"),
    icon: ListBulletIcon,
  },
  {
    key: "schedule",
    label: t("admin.finance.payouts.schedule"),
    icon: CalendarDaysIcon,
  },
];

export const payoutStatusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.common.allStatuses") },
  { value: "held", label: t("admin.finance.payouts.status.held") },
  { value: "released", label: t("admin.finance.payouts.status.released") },
  { value: "cancelled", label: t("admin.finance.payouts.status.cancelled") },
];
