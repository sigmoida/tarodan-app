import { motion } from 'framer-motion';
import { Button } from '@tarodan/ui';

interface DeleteListingModalProps {
  onClose: () => void;
  handleDelete: () => void;
  isLoading: boolean;
}

export default function DeleteListingModal({ onClose, handleDelete, isLoading }: DeleteListingModalProps) {
  return (
    <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-elevated rounded-2xl p-6 max-w-md w-full"
      >
        <h3 className="text-xl font-bold text-heading mb-4">İlanı Sil</h3>
        <p className="text-muted mb-6">
          Bu ilanı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve ilan kalıcı olarak silinir.
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
            disabled={isLoading}
          >
            {isLoading ? 'Siliniyor...' : 'Evet, Sil'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
