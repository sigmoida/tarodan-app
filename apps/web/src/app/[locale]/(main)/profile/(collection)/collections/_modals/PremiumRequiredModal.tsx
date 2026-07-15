/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { FolderPlusIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";

/** Shown when a free-tier user tries to create a collection. */
export default function PremiumRequiredModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary-50">
          <FolderPlusIcon className="h-7 w-7 text-primary-500" />
        </div>
        <h2 className="mb-2 text-lg font-bold text-heading">
          Üyelik Yükseltme Gerekli
        </h2>
        <p className="mb-5 text-sm text-muted">
          Koleksiyon oluşturma özelliği Temel ve üzeri üyelikler için aktiftir.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button asChild variant="primary" className="flex-1">
            <Link href="/membership">Üyeliği Yükselt</Link>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
