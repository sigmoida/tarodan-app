import { statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { type LogTab, actionLabels, entityLabels } from "./types";

const buildOptions = (t: TranslateFn) => ({
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
    // `delivered`/`bounced` hiç yazılmıyor (webhook yok); `queued` da artık
    // yazılmıyor — kayıt tek noktadan (SmtpProvider) sent/failed olarak düşer.
    { value: "failed", label: t("admin.system.logs.emailStatuses.failed") },
  ],
  // Değerler GERÇEK şablon anahtarlarıdır (email-template-registry, kebab-case).
  // Eski liste alt-çizgili uydurma değerler taşıyordu (password_reset vb.) ve
  // API tam eşitlikle süzdüğü için 4 seçeneğin 3'ü hiçbir satırla eşleşmiyordu.
  emailTemplate: [
    { value: "all", label: t("admin.system.logs.filters.allTemplates") },
    { value: "welcome", label: t("admin.system.logs.templates.welcome") },
    {
      value: "password-reset",
      label: t("admin.system.logs.templates.passwordReset"),
    },
    {
      value: "order-confirmation",
      label: t("admin.system.logs.templates.orderConfirmation"),
    },
    {
      value: "order-shipped",
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

/**
 * Each log tab filters on its own fields. The page remounts the list on tab
 * change (`key={tab}`), so the schema is read fresh per tab.
 *
 * The audit tab's `adminId` / `fromDate` / `toDate` params have no control and
 * stay in the page's `initialFilters`.
 */
export const logFilterFields = (t: TranslateFn, tab: LogTab): FilterField[] => {
  const options = buildOptions(t);
  const severity = (list: { value: string; label: string }[]): FilterField => ({
    type: "select",
    name: "severity",
    label: t("admin.shared.filterDialog.labels.severity"),
    options: list,
  });

  if (tab === "errors") return [severity(options.errorSeverity)];
  if (tab === "security")
    return [
      severity(options.securitySeverity),
      {
        type: "select",
        name: "resolved",
        label: t("admin.shared.filterDialog.labels.resolved"),
        options: options.resolved,
      },
    ];
  if (tab === "emails")
    return [
      statusField(t, options.emailStatus),
      {
        type: "select",
        name: "template",
        label: t("admin.shared.filterDialog.labels.template"),
        options: options.emailTemplate,
      },
    ];
  return [
    {
      type: "select",
      name: "action",
      label: t("admin.shared.filterDialog.labels.action"),
      options: options.auditAction,
    },
    {
      type: "select",
      name: "entityType",
      label: t("admin.shared.filterDialog.labels.entityType"),
      options: options.auditEntity,
    },
  ];
};

/** Params the audit tab accepts but offers no control for (deep links). */
export const AUDIT_HIDDEN_FILTERS: Record<string, string> = {
  adminId: "",
  fromDate: "",
  toDate: "",
};
