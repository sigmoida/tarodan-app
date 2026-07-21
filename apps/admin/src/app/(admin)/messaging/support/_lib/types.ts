import {
  ticketStatusConfig,
  ticketPriorityConfig,
  ticketCategoryConfig,
} from "@tarodan/ui";
import { statusFilterOptions } from "@/lib/utils";
import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuestContact {
  referenceNumber: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  status: string;
}

export const supportTabs = (t: T) => [
  { key: "tickets", label: t("admin.messaging.support.tabs.tickets") },
  { key: "guest", label: t("admin.messaging.support.tabs.guest") },
];

export const supportTicketStatusConfig = (
  t: T,
): Record<string, StatusConfig> => ({
  open: {
    ...ticketStatusConfig.open,
    label: t("admin.messaging.support.status.open"),
  },
  in_progress: {
    ...ticketStatusConfig.in_progress,
    label: t("admin.messaging.support.status.inProgress"),
  },
  waiting_customer: {
    ...ticketStatusConfig.waiting_customer,
    label: t("admin.messaging.support.status.waitingCustomer"),
  },
  resolved: {
    ...ticketStatusConfig.resolved,
    label: t("admin.messaging.support.status.resolved"),
  },
  closed: {
    ...ticketStatusConfig.closed,
    label: t("admin.messaging.support.status.closed"),
  },
});

export const supportTicketPriorityConfig = (
  t: T,
): Record<string, StatusConfig> => ({
  low: {
    ...ticketPriorityConfig.low,
    label: t("admin.messaging.support.priority.low"),
  },
  medium: {
    ...ticketPriorityConfig.medium,
    label: t("admin.messaging.support.priority.medium"),
  },
  high: {
    ...ticketPriorityConfig.high,
    label: t("admin.messaging.support.priority.high"),
  },
  urgent: {
    ...ticketPriorityConfig.urgent,
    label: t("admin.messaging.support.priority.urgent"),
  },
});

export const supportTicketCategoryConfig = (
  t: T,
): Record<string, StatusConfig> => ({
  payment: {
    ...ticketCategoryConfig.payment,
    label: t("admin.messaging.support.category.payment"),
  },
  shipping: {
    ...ticketCategoryConfig.shipping,
    label: t("admin.messaging.support.category.shipping"),
  },
  trade: {
    ...ticketCategoryConfig.trade,
    label: t("admin.messaging.support.category.trade"),
  },
  account: {
    ...ticketCategoryConfig.account,
    label: t("admin.messaging.support.category.account"),
  },
  product: {
    ...ticketCategoryConfig.product,
    label: t("admin.messaging.support.category.product"),
  },
  technical: {
    ...ticketCategoryConfig.technical,
    label: t("admin.messaging.support.category.technical"),
  },
  other: {
    ...ticketCategoryConfig.other,
    label: t("admin.messaging.support.category.other"),
  },
});

/** Toolbar filter options, derived from the shared ticket status configs. */
export const ticketStatusOptions = (t: T) =>
  statusFilterOptions(supportTicketStatusConfig(t), {
    allLabel: t("admin.messaging.support.allStatuses"),
  });
export const ticketPriorityOptions = (t: T) =>
  statusFilterOptions(supportTicketPriorityConfig(t), {
    allLabel: t("admin.messaging.support.allPriorities"),
  });
export const ticketCategoryOptions = (t: T) =>
  statusFilterOptions(supportTicketCategoryConfig(t), {
    allLabel: t("admin.messaging.support.allCategories"),
  });

/** Status choices for the detail status-change modal (no "all" option). */
export const ticketStatusChoices = (t: T) =>
  Object.entries(supportTicketStatusConfig(t)).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  }));
