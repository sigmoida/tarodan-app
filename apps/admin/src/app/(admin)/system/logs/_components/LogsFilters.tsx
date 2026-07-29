/** @format */

"use client";

import { Select } from "@tarodan/ui";
import { type LogTab } from "../_lib/types";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const buildOptions = (t: ReturnType<typeof useTranslations<never>>) => ({
  errorSeverity: [
    { value: "all", label: t("admin.system.logs.filters.allLevels") },
    { value: "critical", label: t("admin.system.logs.levels.critical") },
    { value: "error", label: t("admin.system.logs.levels.error") },
    { value: "warning", label: t("admin.system.logs.levels.warning") },
    { value: "low", label: t("admin.system.logs.levels.low") },
  ],
  securitySeverity: [
    { value: "all", label: t("admin.system.logs.filters.allLevels") },
    { value: "critical", label: t("admin.system.logs.levels.critical") },
    { value: "high", label: t("admin.system.logs.levels.high") },
    { value: "medium", label: t("admin.system.logs.levels.medium") },
    { value: "low", label: t("admin.system.logs.levels.low") },
  ],
  resolved: [
    { value: "all", label: t("common.allStatuses") },
    { value: "false", label: t("admin.system.logs.filters.pending") },
    { value: "true", label: t("admin.system.logs.filters.resolved") },
  ],
  emailStatus: [
    { value: "all", label: t("common.allStatuses") },
    { value: "sent", label: t("admin.system.logs.emailStatuses.sent") },
    {
      value: "delivered",
      label: t("admin.system.logs.emailStatuses.delivered"),
    },
    { value: "queued", label: t("admin.system.logs.emailStatuses.queued") },
    { value: "bounced", label: t("admin.system.logs.emailStatuses.bounced") },
    { value: "failed", label: t("admin.system.logs.emailStatuses.failed") },
  ],
  emailTemplate: [
    { value: "all", label: t("admin.system.logs.filters.allTemplates") },
    { value: "welcome", label: t("admin.system.logs.templates.welcome") },
    {
      value: "password_reset",
      label: t("admin.system.logs.templates.passwordReset"),
    },
    {
      value: "order_confirmation",
      label: t("admin.system.logs.templates.orderConfirmation"),
    },
    {
      value: "shipping_update",
      label: t("admin.system.logs.templates.shippingUpdate"),
    },
  ],
  auditAction: [
    { value: "", label: t("admin.system.logs.filters.allActions") },
    { value: "user_ban", label: t("admin.system.logs.actions.userBan") },
    { value: "user_unban", label: t("admin.system.logs.actions.userUnban") },
    {
      value: "product_approve",
      label: t("admin.system.logs.actions.productApprove"),
    },
    {
      value: "product_reject",
      label: t("admin.system.logs.actions.productReject"),
    },
    {
      value: "product_delete",
      label: t("admin.system.logs.actions.productDelete"),
    },
    {
      value: "order_update",
      label: t("admin.system.logs.actions.orderUpdate"),
    },
    {
      value: "payment_refund",
      label: t("admin.system.logs.actions.paymentRefund"),
    },
  ],
  auditEntity: [
    { value: "", label: t("admin.system.logs.filters.allEntityTypes") },
    { value: "User", label: t("admin.system.logs.entities.user") },
    { value: "Product", label: t("admin.system.logs.entities.product") },
    { value: "Order", label: t("admin.system.logs.entities.order") },
    { value: "Payment", label: t("admin.system.logs.entities.payment") },
  ],
});

export function LogsFilters({
  tab,
  filters,
  setFilter,
}: {
  tab: LogTab;
  filters: Record<string, string>;
  setFilter: (name: string, value: string) => void;
}) {
  const t = useTranslations();
  const options = buildOptions(t);
  const sel = (
    name: string,
    options: { value: string; label: string }[],
    fallback: string,
    className: string,
  ) => (
    <Select
      value={filters[name] ?? fallback}
      onChange={(e) => setFilter(name, e.target.value)}
      options={options}
      className={cn(
        "min-w-32 max-w-56 shrink overflow-hidden whitespace-nowrap",
        "[&>span:first-child]:min-w-0 [&>span:first-child]:truncate",
        className,
      )}
    />
  );

  if (tab === "errors")
    return sel("severity", options.errorSeverity, "all", "sm:w-48");
  if (tab === "security")
    return (
      <>
        {sel("severity", options.securitySeverity, "all", "sm:w-48")}
        {sel("resolved", options.resolved, "all", "sm:w-44")}
      </>
    );
  if (tab === "emails")
    return (
      <>
        {sel("status", options.emailStatus, "all", "sm:w-48")}
        {sel("template", options.emailTemplate, "all", "sm:w-48")}
      </>
    );
  return (
    <>
      {sel("action", options.auditAction, "", "sm:w-52")}
      {sel("entityType", options.auditEntity, "", "sm:w-44")}
    </>
  );
}
