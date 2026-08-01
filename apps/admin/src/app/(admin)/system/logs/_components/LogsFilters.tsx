/** @format */

"use client";

import { Select } from "@tarodan/ui";
import { type LogTab, actionLabels, entityLabels } from "../_lib/types";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const buildOptions = (t: ReturnType<typeof useTranslations<never>>) => ({
  // Interceptor yalnız `error` (5xx) ve `warning` (4xx) üretir; `critical`/`low`
  // hiç yazılmadığı için seçenek olarak sunulmaz. (Güvenlik sekmesi dört
  // seviyeyi de gerçekten yazar, o liste dokunulmadan kalır.)
  errorSeverity: [
    { value: "all", label: t("admin.system.logs.filters.allLevels") },
    { value: "error", label: t("admin.system.logs.levels.error") },
    { value: "warning", label: t("admin.system.logs.levels.warning") },
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
    // `delivered`/`bounced` hiçbir kod yolunda yazılmıyor (sağlayıcı webhook'u
    // yok) → seçenek olarak sunulmaz.
    { value: "queued", label: t("admin.system.logs.emailStatuses.queued") },
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
  // Aksiyon ve varlık seçenekleri tabloyla AYNI haritadan türetilir: elle
  // yazılmış liste hem eksikti (16 aksiyondan 7'si) hem de üç değeri kodda
  // hiç üretilmiyordu — filtre çalışıyor görünüp boş sonuç döndürüyordu.
  auditAction: [
    { value: "", label: t("admin.system.logs.filters.allActions") },
    ...Object.entries(actionLabels(t)).map(([value, label]) => ({
      value,
      label,
    })),
  ],
  auditEntity: [
    { value: "", label: t("admin.system.logs.filters.allEntityTypes") },
    ...Object.entries(entityLabels(t)).map(([value, label]) => ({
      value,
      label,
    })),
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
