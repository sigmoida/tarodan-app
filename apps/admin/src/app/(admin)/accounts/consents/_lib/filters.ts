import {
  CONSENT_ACTIONS,
  CONSENT_ACTION_I18N_KEYS,
  CONSENT_DOCUMENT_I18N_KEYS,
  CONSENT_DOCUMENT_KEYS,
  CONSENT_SOURCES,
  CONSENT_SOURCE_I18N_KEYS,
  CONSENT_SUBJECT_TYPES,
  CONSENT_SUBJECT_TYPE_I18N_KEYS,
} from "@tarodan/types";
import { dateRangeField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";

/**
 * Seçenekler paylaşılan onay kataloğundan türetilir (API'nin kabul ettiği
 * değerlerin aynısı); ilk seçenek "Tümü" (`all`, istekten düşer). Tarih
 * aralığı kaydın oluştuğu an üzerindendir.
 */
const withAll = (
  t: TranslateFn,
  options: Array<{ value: string; label: string }>,
) => [{ value: "all", label: t("common.all") }, ...options];

export const consentFilterFields = (t: TranslateFn): FilterField[] => [
  {
    type: "select",
    name: "document",
    label: t("admin.consents.filters.document"),
    options: withAll(
      t,
      CONSENT_DOCUMENT_KEYS.map((key) => ({
        value: key,
        label: t(CONSENT_DOCUMENT_I18N_KEYS[key]),
      })),
    ),
  },
  {
    type: "select",
    name: "action",
    label: t("admin.consents.filters.action"),
    options: withAll(
      t,
      CONSENT_ACTIONS.map((action) => ({
        value: action,
        label: t(CONSENT_ACTION_I18N_KEYS[action]),
      })),
    ),
  },
  {
    type: "select",
    name: "source",
    label: t("admin.consents.filters.source"),
    options: withAll(
      t,
      CONSENT_SOURCES.map((source) => ({
        value: source,
        label: t(CONSENT_SOURCE_I18N_KEYS[source]),
      })),
    ),
  },
  {
    type: "select",
    name: "subjectType",
    label: t("admin.consents.filters.subjectType"),
    options: withAll(
      t,
      CONSENT_SUBJECT_TYPES.map((subject) => ({
        value: subject,
        label: t(CONSENT_SUBJECT_TYPE_I18N_KEYS[subject]),
      })),
    ),
  },
  dateRangeField(t),
];
