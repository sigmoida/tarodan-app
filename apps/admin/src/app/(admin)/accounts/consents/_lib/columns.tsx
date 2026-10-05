import { Badge } from "@tarodan/ui";
import {
  CONSENT_ACTION_I18N_KEYS,
  CONSENT_DOCUMENT_I18N_KEYS,
  CONSENT_SOURCE_I18N_KEYS,
  CONSENT_SUBJECT_TYPE_I18N_KEYS,
  isConsentDocumentKey,
  type AdminConsentRecordRow,
} from "@tarodan/types";
import { col } from "@/components/table";
import type { TranslateFn } from "@/components/list/filters/types";
import { consentReference, consentSubject } from "./rows";

/**
 * Onay Kayıtları tablosu. Sıralanabilir kolonlar API'nin DMMF tabanlı
 * `resolveOrderBy`ına giden alan yollarıdır (`user.displayName` gibi).
 * Satır salt okunurdur — kayıt değişmez, aksiyon kolonu yoktur.
 */
export function consentColumns(t: TranslateFn) {
  return [
    col.date<AdminConsentRecordRow>(
      t("admin.consents.columns.createdAt"),
      (r) => r.createdAt,
      { sortKey: "createdAt", sortType: "date", withTime: true },
    ),
    col.text<AdminConsentRecordRow>(
      t("admin.consents.columns.document"),
      (r) =>
        isConsentDocumentKey(r.document)
          ? t(CONSENT_DOCUMENT_I18N_KEYS[r.document])
          : r.document,
      { minWidth: 200, sortKey: "document", sortType: "text" },
    ),
    col.badge<AdminConsentRecordRow>(
      t("admin.consents.columns.version"),
      (r) => (
        <Badge variant={r.isCurrentVersion ? "success" : "warning"}>
          {r.version}
          {r.isCurrentVersion
            ? ""
            : ` · ${t("admin.consents.outdatedVersion")}`}
        </Badge>
      ),
      {
        sortKey: "version",
        sortType: "text",
        exportValue: (r) => (r as AdminConsentRecordRow).version,
      },
    ),
    col.badge<AdminConsentRecordRow>(
      t("admin.consents.columns.action"),
      (r) => (
        <Badge variant={r.action === "granted" ? "success" : "danger"}>
          {t(CONSENT_ACTION_I18N_KEYS[r.action])}
        </Badge>
      ),
      {
        sortKey: "action",
        sortType: "text",
        exportValue: (r) =>
          t(CONSENT_ACTION_I18N_KEYS[(r as AdminConsentRecordRow).action]),
      },
    ),
    col.user<AdminConsentRecordRow>(
      t("admin.consents.columns.subject"),
      (r) => consentSubject(t, r),
      { sortKey: "user.displayName", sortType: "text" },
    ),
    col.muted<AdminConsentRecordRow>(
      t("admin.consents.columns.source"),
      (r) => t(CONSENT_SOURCE_I18N_KEYS[r.source]),
      { minWidth: 180, sortKey: "source", sortType: "text" },
    ),
    col.code<AdminConsentRecordRow>(
      t("admin.consents.columns.ipAddress"),
      (r) => r.ipAddress ?? "—",
      { minWidth: 150, sortKey: "ipAddress", sortType: "text" },
    ),
    col.muted<AdminConsentRecordRow>(
      t("admin.consents.columns.userAgent"),
      (r) => r.userAgent ?? "—",
      { minWidth: 220, sortKey: "userAgent", sortType: "text" },
    ),
    col.link<AdminConsentRecordRow>(
      t("admin.consents.columns.reference"),
      (r) => consentReference(r),
      { minWidth: 160, sortable: false },
    ),
    col.muted<AdminConsentRecordRow>(
      t("admin.consents.columns.subjectType"),
      (r) => t(CONSENT_SUBJECT_TYPE_I18N_KEYS[r.subjectType]),
      { minWidth: 120, sortable: false },
    ),
  ];
}
