'use client';

import toast from 'react-hot-toast';
import { Button } from '@tarodan/ui';
import { ArrowUturnLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import type { TradeDetail } from '../types';

/** PayTR refund-failure panel — self-contained (owns the retry mutation + confirm). */
export function RefundFailurePanel({ trade }: { trade: TradeDetail }) {
  const confirm = useConfirm();
  const retry = useAdminMutation(() => adminApi.retryTradeRefund(trade.id), {
    invalidates: ['trades'],
    errorMessage: 'İade yeniden denemesi başarısız',
    onSuccess: (res) => {
      const d = (res as any)?.data?.data ?? (res as any)?.data;
      if (d?.refunded) toast.success('İade başarıyla tekrar gönderildi');
      else if (d?.skippedReason) toast.success(`İade atlandı: ${d.skippedReason}`);
      else toast.success('İade işlemi tamamlandı');
    },
  });

  if (!trade.refundFailureReason) return null;

  const handle = async () => {
    if (!(await confirm({ description: 'PayTR iadesi yeniden denenecek. Devam edilsin mi?', destructive: true })))
      return;
    retry.mutate();
  };

  return (
    <div className="rounded-xl border-2 border-danger-400 bg-danger-50 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-8 w-8 flex-shrink-0 text-danger-600" />
          <div>
            <h2 className="text-lg font-semibold text-danger-900">PayTR İadesi Başarısız</h2>
            <p className="mt-1 text-sm text-danger-800">{trade.refundFailureReason}</p>
            {trade.refundFailureAt && (
              <p className="mt-1 text-xs text-danger-700">
                Son hata: {new Date(trade.refundFailureAt).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
        </div>
        <Button variant="danger" onClick={handle} isLoading={retry.isPending} className="flex-shrink-0">
          <ArrowUturnLeftIcon className="mr-1 h-5 w-5" />
          İadeyi Tekrar Dene
        </Button>
      </div>
    </div>
  );
}
