'use client';

import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { type ReviewStatus, REVIEW_ACTION_CONFIRM, statusLabels } from '../_lib/types';

/**
 * Shared review moderation action — confirm dialog → status mutation → toast.
 * Used by both the product and seller review tabs (differ only in the API call
 * and the invalidated resource).
 */
export function useReviewAction(
  resource: string,
  updateStatus: (id: string, status: ReviewStatus) => Promise<unknown>,
  entityLabel: string,
) {
  const confirm = useConfirm();

  const mut = useAdminMutation(
    (v: { id: string; status: ReviewStatus }) => updateStatus(v.id, v.status),
    {
      invalidates: [resource],
      errorMessage: 'Güncelleme başarısız',
      onSuccess: (_, v) => toast.success(`${entityLabel} ${statusLabels[v.status]}`),
    },
  );

  const act = async (id: string, status: ReviewStatus) => {
    const ok = await confirm({ ...REVIEW_ACTION_CONFIRM[status], cancelLabel: 'Vazgeç' });
    if (!ok) return;
    mut.mutate({ id, status });
  };

  return { act, isPending: mut.isPending };
}
