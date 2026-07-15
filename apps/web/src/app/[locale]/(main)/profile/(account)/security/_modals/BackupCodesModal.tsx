"use client";

import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";

export default function BackupCodesModal({
  isOpen,
  codes,
  onClose,
}: {
  isOpen: boolean;
  codes: string[];
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen && codes.length > 0}
      onClose={onClose}
      title="2FA Etkinleştirildi!"
      maxWidth="max-w-md"
    >
      <div className="mb-4 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-100">
          <CheckCircleIcon className="h-6 w-6 text-success-600" />
        </div>
        <p className="mt-1 text-sm text-muted">
          Aşağıdaki yedek kodları güvenli bir yere kaydedin.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 p-4">
        <p className="text-sm text-warning-800">
          ⚠️ Bu kodlar sadece bir kez gösterilecek. Telefonunuza erişiminizi
          kaybederseniz hesabınıza giriş yapmak için bu kodlara ihtiyacınız
          olacak.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {codes.map((code, index) => (
          <code
            key={index}
            className="rounded bg-surface-alt px-3 py-2 text-center font-mono text-sm"
          >
            {code}
          </code>
        ))}
      </div>

      <Button
        variant="secondary"
        size="md"
        className="mb-4 w-full"
        onClick={() => navigator.clipboard.writeText(codes.join("\n"))}
      >
        Tüm Kodları Kopyala
      </Button>
      <Button variant="primary" size="lg" className="w-full" onClick={onClose}>
        Tamam, Kaydettim
      </Button>
    </Modal>
  );
}
