import { Button, Modal } from "@tarodan/ui";

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
  return (
    <Modal isOpen onClose={onClose} title="İlanı Sil" maxWidth="max-w-md">
      <p className="mb-6 text-muted">
        Bu ilanı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve
        ilan kalıcı olarak silinir.
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={onClose}
        >
          İptal
        </Button>
        <Button
          variant="danger"
          size="lg"
          className="flex-1"
          onClick={handleDelete}
          isLoading={isLoading}
        >
          Evet, Sil
        </Button>
      </div>
    </Modal>
  );
}
