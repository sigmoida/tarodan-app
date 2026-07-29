/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { FolderPlusIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";
import { useTranslations } from "next-intl";

/** Shared collection capability gate for public and profile collection screens. */
export default function PremiumRequiredModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("collection.membershipRequired")}
      size="md"
      closeLabel={t("common.close")}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/membership">{t("membership.upgrade")}</Link>
          </Button>
        </div>
      }
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-alt">
          <FolderPlusIcon className="h-7 w-7 text-primary-500" />
        </div>
        <p className="text-sm text-muted">
          {t("collection.membershipRequiredDesc")}
        </p>
      </div>
    </Modal>
  );
}
