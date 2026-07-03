'use client';

import { Button } from '@tarodan/ui';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { usePrompt } from '@/components/PromptProvider';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import type { TradeDetail } from '../types';

/** Manual-compensation panel — self-contained (owns the resolve mutation + prompt). */
export function CompensationPanel({ trade }: { trade: TradeDetail }) {
  const prompt = usePrompt();
  const resolve = useAdminMutation(
    (note: string | undefined) => adminApi.resolveTradeCompensation(trade.id, note || undefined),
    { invalidates: ['trades'], successMessage: 'Tazminat kapatıldı' },
  );

  if (!trade.compensationPendingUserId || trade.compensationResolvedAt) return null;

  const handle = async () => {
    const note = await prompt({
      title: 'Tazminatı Çöz',
      label: 'Tazminat çözüm notu (opsiyonel)',
      placeholder: 'Tazminatın nasıl çözüldüğünü yaz...',
      confirmLabel: 'Çöz',
      required: false,
    });
    if (note === null) return;
    resolve.mutate(note || undefined);
  };

  const who =
    trade.compensationPendingUserId === trade.initiator.id
      ? `${trade.initiator.displayName} (teklif veren)`
      : trade.compensationPendingUserId === trade.receiver.id
        ? `${trade.receiver.displayName} (teklif alan)`
        : trade.compensationPendingUserId;

  return (
    <div className="rounded-xl border-2 border-warning-400 bg-warning-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-7 w-7 flex-shrink-0 text-warning-700" />
          <div>
            <h2 className="text-base font-semibold text-warning-900">Manuel Tazminat Bekleniyor</h2>
            <p className="mt-1 text-sm text-warning-800">
              Kullanıcı <span className="font-mono">{who}</span> için platform tazminatı
              işaretlendi. Ödemeyi out-of-band yaptıktan sonra &quot;Kapatıldı&quot; butonuna basın.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={handle}
          isLoading={resolve.isPending}
          className="flex-shrink-0"
        >
          Kapatıldı
        </Button>
      </div>
    </div>
  );
}
