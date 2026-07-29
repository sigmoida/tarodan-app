"use client";

import { ConfirmDialog } from "@tarodan/ui";
import { useTranslations } from "next-intl";

interface DeleteCollectionModalProps {
  show: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteCollectionModal({
  show,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteCollectionModalProps) {
  const t = useTranslations();

  return (
    <ConfirmDialog
      isOpen={show}
      onClose={onCancel}
      onConfirm={onConfirm}
      title={t("collection.deleteCollection")}
      description={t("collection.deleteCollectionConfirm")}
      cancelLabel={t("common.cancel")}
      confirmLabel={t("collection.yesDelete")}
      closeLabel={t("common.close")}
      destructive
      isLoading={isDeleting}
    />
  );
}
