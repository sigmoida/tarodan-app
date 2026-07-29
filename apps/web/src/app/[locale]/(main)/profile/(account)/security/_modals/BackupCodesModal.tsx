"use client";

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Alert, Button, Modal } from "@tarodan/ui";

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
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt">
          <CheckCircleIcon className="h-6 w-6 text-success-600" />
        </div>
        <p className="mt-1 text-sm text-muted">
          Aşağıdaki yedek kodları güvenli bir yere kaydedin.
        </p>
      </div>

      <Alert
        variant="warning"
        title="Önemli"
        icon={<ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />}
        className="mb-4"
      >
        Bu kodlar sadece bir kez gösterilecek. Telefonunuza erişiminizi
        kaybederseniz hesabınıza giriş yapmak için bu kodlara ihtiyacınız
        olacak.
      </Alert>

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
