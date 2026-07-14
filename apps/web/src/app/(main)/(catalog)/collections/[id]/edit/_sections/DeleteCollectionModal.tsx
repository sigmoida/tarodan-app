"use client";

import { Button, Modal } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";

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
    <Modal
      isOpen={show}
      onClose={onCancel}
      title={t("collection.deleteCollection")}
      maxWidth="max-w-md"
    >
      <p className="mb-5 text-sm text-muted">
        {t("collection.deleteCollectionConfirm")}
      </p>
      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={onCancel}
          disabled={isDeleting}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="md"
          className="flex-1"
          onClick={onConfirm}
          isLoading={isDeleting}
        >
          {t("collection.yesDelete")}
        </Button>
      </div>
    </Modal>
  );
}
