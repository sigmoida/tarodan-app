import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  EnvelopeIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type LogTab = "errors" | "security" | "emails" | "audit";

export interface ErrorLog {
  id: string;
  severity: string;
  message: string;
  stackTrace?: string;
  source: string;
  endpoint?: string;
  userId?: string;
  requestId?: string;
  metadata?: {
    status?: number;
    name?: string;
    causes?: string[];
    response?: any;
    ip?: string;
    userAgent?: string;
    body?: any;
  };
  createdAt: string;
}

export interface SecurityLog {
  id: string;
  eventType: string;
  severity: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  details?: Record<string, any>;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  messageId?: string;
  to: string;
  from: string;
  subject: string;
  template?: string;
  status: string;
  provider: string;
  userId?: string;
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
  bouncedAt?: string;
  openedAt?: string;
  clickedAt?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminUserId: string;
  admin?: { id: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  createdAt: string;
}

export type AnyLog = ErrorLog | SecurityLog | EmailLog | AuditLog;

export const logTabs = (
  t: T,
): {
  key: LogTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}[] => [
  {
    key: "errors",
    label: t("admin.system.logs.tabs.errors.label"),
    icon: ExclamationTriangleIcon,
    description: t("admin.system.logs.tabs.errors.description"),
  },
  {
    key: "security",
    label: t("admin.system.logs.tabs.security.label"),
    icon: ShieldExclamationIcon,
    description: t("admin.system.logs.tabs.security.description"),
  },
  {
    key: "emails",
    label: t("admin.system.logs.tabs.emails.label"),
    icon: EnvelopeIcon,
    description: t("admin.system.logs.tabs.emails.description"),
  },
  {
    key: "audit",
    label: t("admin.system.logs.tabs.audit.label"),
    icon: ClipboardDocumentIcon,
    description: t("admin.system.logs.tabs.audit.description"),
  },
];

export const severityColors: Record<string, string> = {
  critical: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  high: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  error: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  medium: "bg-warning-500/10 text-warning-700 border-warning-500/20",
  warning: "bg-warning-500/10 text-warning-700 border-warning-500/20",
  low: "bg-info-500/10 text-info-700 border-info-500/20",
};

export const statusColors: Record<string, string> = {
  sent: "bg-success-500/10 text-success-700",
  delivered: "bg-success-500/10 text-success-700",
  queued: "bg-warning-500/10 text-warning-700",
  bounced: "bg-danger-500/10 text-danger-600",
  failed: "bg-danger-500/10 text-danger-600",
};

export const eventTypeLabels = (t: T): Record<string, string> => ({
  failed_login: t("admin.system.logs.events.failedLogin"),
  ip_block: t("admin.system.logs.events.ipBlock"),
  suspicious_activity: t("admin.system.logs.events.suspiciousActivity"),
  password_reset: t("admin.system.logs.events.passwordReset"),
  "2fa_enabled": t("admin.system.logs.events.twoFactorEnabled"),
  account_locked: t("admin.system.logs.events.accountLocked"),
});

export const actionLabels = (t: T): Record<string, string> => ({
  user_ban: t("admin.system.logs.actions.userBan"),
  user_unban: t("admin.system.logs.actions.userUnban"),
  product_approve: t("admin.system.logs.actions.productApprove"),
  product_reject: t("admin.system.logs.actions.productReject"),
  // Gerçek aksiyon adları (audit yazan servislerden): eskiden burada
  // `product_delete` / `order_update` / `payment_refund` yazıyordu — hiçbiri
  // kodda üretilmiyor, dolayısıyla filtre hiçbir satırla eşleşmiyordu.
  product_delete_soft: t("admin.system.logs.actions.productDelete"),
  product_delete_hard: t("admin.system.logs.actions.productDeleteHard"),
  order_status_update: t("admin.system.logs.actions.orderUpdate"),
  payment_manual_refund: t("admin.system.logs.actions.paymentRefund"),
  category_create: t("admin.system.logs.actions.categoryCreate"),
  category_update: t("admin.system.logs.actions.categoryUpdate"),
  category_delete: t("admin.system.logs.actions.categoryDelete"),
  commission_rule_create: t("admin.system.logs.actions.commissionRuleCreate"),
  commission_rule_update: t("admin.system.logs.actions.commissionRuleUpdate"),
  commission_rule_delete: t("admin.system.logs.actions.commissionRuleDelete"),
  trade_resolve: t("admin.system.logs.actions.tradeResolve"),
  message_approve: t("admin.system.logs.actions.messageApprove"),
  message_reject: t("admin.system.logs.actions.messageReject"),
});

export const entityLabels = (t: T): Record<string, string> => ({
  User: t("admin.system.logs.entities.user"),
  Product: t("admin.system.logs.entities.product"),
  Order: t("admin.system.logs.entities.order"),
  Payment: t("admin.system.logs.entities.payment"),
  Category: t("admin.system.logs.entities.category"),
  CommissionRule: t("admin.system.logs.entities.commissionRule"),
  Trade: t("admin.system.logs.entities.trade"),
  Message: t("admin.system.logs.entities.message"),
  SupportTicket: t("admin.system.logs.entities.supportTicket"),
});

export const searchPlaceholders = (t: T): Record<LogTab, string> => ({
  errors: t("admin.system.logs.search.errors"),
  security: t("admin.system.logs.search.security"),
  emails: t("admin.system.logs.search.emails"),
  audit: t("admin.system.logs.search.audit"),
});

export const emptyText = (t: T): Record<LogTab, string> => ({
  errors: t("admin.system.logs.empty.errors"),
  security: t("admin.system.logs.empty.security"),
  emails: t("admin.system.logs.empty.emails"),
  audit: t("admin.system.logs.empty.audit"),
});

export function formatDate(date: string, locale: string) {
  return new Date(date).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
