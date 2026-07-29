import {
  CurrencyDollarIcon,
  UsersIcon,
  ShoppingBagIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type DateRange = "7d" | "30d" | "90d" | "1y";

export interface AnalyticsData {
  salesReport: any;
  userReport: any;
  productReport: any;
  tradeReport: any;
  availability: Record<"sales" | "users" | "products" | "trades", boolean>;
}

export const getDateRangeOptions = (t: T) => [
  { value: "7d", label: t("admin.analytics.dateRange.7d") },
  { value: "30d", label: t("admin.analytics.dateRange.30d") },
  { value: "90d", label: t("admin.analytics.dateRange.90d") },
  { value: "1y", label: t("admin.analytics.dateRange.1y") },
];

export const getAnalyticsTabs = (t: T) => [
  {
    key: "sales",
    label: t("admin.analytics.tabs.sales"),
    icon: CurrencyDollarIcon,
  },
  { key: "users", label: t("admin.analytics.tabs.users"), icon: UsersIcon },
  {
    key: "products",
    label: t("admin.analytics.tabs.products"),
    icon: ShoppingBagIcon,
  },
  {
    key: "trades",
    label: t("admin.analytics.tabs.trades"),
    icon: ArrowsRightLeftIcon,
  },
];

export const getOrderStatusLabels = (t: T): Record<string, string> => ({
  pending_payment: t("admin.analytics.orderStatus.pendingPayment"),
  paid: t("admin.analytics.orderStatus.paid"),
  preparing: t("admin.analytics.orderStatus.preparing"),
  shipped: t("admin.analytics.orderStatus.shipped"),
  delivered: t("admin.analytics.orderStatus.delivered"),
  completed: t("admin.analytics.orderStatus.completed"),
  cancelled: t("admin.analytics.orderStatus.cancelled"),
  refund_requested: t("admin.analytics.orderStatus.refundRequested"),
  refunded: t("admin.analytics.orderStatus.refunded"),
});

export function getDateRangeParams(dateRange: DateRange) {
  const endDate = new Date();
  const startDate = new Date();
  switch (dateRange) {
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(startDate.getDate() - 90);
      break;
    case "1y":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
  }
  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}
