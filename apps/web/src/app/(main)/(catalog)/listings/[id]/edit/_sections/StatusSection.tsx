import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@tarodan/ui';

interface StatusSectionProps {
  status: string;
  isLoading: boolean;
  handleDeactivate: () => void;
  handleActivate: () => void;
  setShowDeleteModal: Dispatch<SetStateAction<boolean>>;
}

export default function StatusSection({
  status,
  isLoading,
  handleDeactivate,
  handleActivate,
  setShowDeleteModal,
}: StatusSectionProps) {
  return (
    <div className="border-t border-border pt-6 mt-6">
      <h3 className="text-lg font-semibold text-heading mb-4">İlan Durumu</h3>
      <div className="flex flex-col sm:flex-row gap-3">
        {status === 'active' ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={handleDeactivate}
            disabled={isLoading}
          >
            🔒 İlanı Pasife Al
          </Button>
        ) : status === 'pending' ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled
          >
            ⏳ İnceleme Bekleniyor
          </Button>
        ) : (
          <Button
            type="button"
            variant="success"
            size="lg"
            className="flex-1"
            onClick={handleActivate}
            disabled={isLoading}
          >
            📤 İncelemeye Gönder
          </Button>
        )}
        <Button
          type="button"
          variant="danger"
          size="lg"
          className="flex-1"
          onClick={() => setShowDeleteModal(true)}
          disabled={isLoading}
        >
          🗑️ İlanı Sil
        </Button>
      </div>
      <p className="text-sm text-muted mt-2">
        {status === 'active'
          ? 'Pasife alınan ilanlar listelemede görünmez ama silinmez.'
          : status === 'pending'
            ? 'İlanınız onay bekliyor; admin onayından sonra yayına girer.'
            : 'İlanlar yayına girmeden önce admin onayından geçer.'}
      </p>
    </div>
  );
}
