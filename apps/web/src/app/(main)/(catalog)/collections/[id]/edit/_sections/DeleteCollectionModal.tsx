'use client';

import { Button } from '@tarodan/ui';
import { useTranslation } from '@/i18n/LanguageContext';

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
  const { t } = useTranslation();

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50">
      <div className="bg-surface-elevated rounded p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-3 text-heading">
          {t('collection.deleteCollection')}
        </h2>
        <p className="text-muted text-sm mb-5">
          {t('collection.deleteCollectionConfirm')}
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
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="md"
            className="flex-1"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? t('collection.deleting') : t('collection.yesDelete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
