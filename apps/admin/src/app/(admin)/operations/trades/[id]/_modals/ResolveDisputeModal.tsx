'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter, Select, Textarea } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';

export function ResolveDisputeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const [resolution, setResolution] = useState('complete_trade');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) {
      setResolution('complete_trade');
      setNote('');
    }
  }, [open]);

  const resolve = useAdminMutation(
    () => adminApi.resolveTradeDispute(tradeId, resolution, note.trim()),
    {
      invalidates: ['trades'],
      successMessage: 'Takas çözümlendi',
      errorMessage: 'Çözüm işlemi başarısız',
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (note.trim().length < 10) {
      toast.error('Çözüm notu en az 10 karakter olmalıdır');
      return;
    }
    resolve.mutate();
  };

  return (
    <Modal isOpen={open} onClose={() => !resolve.isPending && onClose()} title="Takas Çözümle">
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-body">Çözüm</label>
          <Select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={resolve.isPending}
          >
            <option value="complete_trade">Takası Tamamla</option>
            <option value="cancel_trade">Takası İptal Et (iade tetiklenir)</option>
            <option value="compensate_initiator">
              Teklif Verene Tazminat (iptal + iade + tazminat işareti)
            </option>
            <option value="compensate_receiver">
              Teklif Alana Tazminat (iptal + iade + tazminat işareti)
            </option>
          </Select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            Çözüm Notu (en az 10 karakter)
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Çözüm gerekçesini özetleyin (kargo kayıp, hasar, vs.)..."
            disabled={resolve.isPending}
          />
        </div>
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          confirmLabel="Çözümle"
          isLoading={resolve.isPending}
        />
      </div>
    </Modal>
  );
}
