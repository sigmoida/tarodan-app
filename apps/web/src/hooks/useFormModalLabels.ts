"use client";

import { useTranslations } from "next-intl";

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
