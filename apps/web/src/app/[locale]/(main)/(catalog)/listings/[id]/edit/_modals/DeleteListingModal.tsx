"use client";

import { ConfirmDialog } from "@tarodan/ui";
import { useTranslations } from "next-intl";

interface DeleteListingModalProps {
  onClose: () => void;
  handleDelete: () => void;
  isLoading: boolean;
}

export default function DeleteListingModal({
  onClose,
  handleDelete,
  isLoading,
}: DeleteListingModalProps) {
  const t = useTranslations();

  return (
    <ConfirmDialog
      isOpen
      onClose={onClose}
      onConfirm={handleDelete}
      title={t("product.deleteListing")}
      description={t("product.deleteConfirm")}
      cancelLabel={t("common.cancel")}
      confirmLabel={t("collection.yesDelete")}
      closeLabel={t("common.close")}
      destructive
      isLoading={isLoading}
    />
  );
}
