"use client";

import { useTranslations } from "next-intl";

/**
 * The translated chrome of `FormModal` (close, cancel, the dirty-form
 * warning). `@tarodan/ui` stays i18n-agnostic, so its defaults are Turkish
 * literals; spread this into a `FormModal` so the dialog follows the admin's
 * language. Same keys as web's `useFormModalLabels`.
 */
export function useFormModalLabels() {
  const t = useTranslations();
  return {
    closeLabel: t("common.close"),
    cancelLabel: t("common.cancel"),
    discardConfirmation: {
      title: t("common.unsavedChanges"),
      description: t("common.unsavedChangesDescription"),
      confirmLabel: t("common.discardChanges"),
      cancelLabel: t("common.continueEditing"),
      destructive: true,
    },
  };
}
