import { XCircleIcon } from '@heroicons/react/24/outline';
import { enumLabel, refundReasonConfig } from '@tarodan/ui';
import { cancelReasonLabel } from '@/lib/utils';
import { SectionCard } from '@/components/detail/SectionCard';
import type { TradeDetail } from '../types';

/** Rejection/cancellation reason + admin notes + legacy dispute cards. */
export function TradeInfoCards({ trade }: { trade: TradeDetail }) {
  const rawReason = trade.rejectionReason || trade.cancellationReason || trade.cancelReason;
  const shortReason = trade.rejectionReason
    ? null
    : cancelReasonLabel(trade.cancellationReason || trade.cancelReason);

  return (
    <>
      {rawReason && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-danger-900">
            <XCircleIcon className="h-5 w-5" />
            {trade.rejectionReason ? 'Red Sebebi' : 'İptal Sebebi'}
          </h2>
          {shortReason && shortReason !== rawReason && (
            <p className="mb-1 text-sm font-medium text-danger-700">{shortReason}</p>
          )}
          <p className="whitespace-pre-wrap text-sm text-danger-800">{rawReason}</p>
        </div>
      )}

      {trade.adminNotes && (
        <div className="rounded-xl border border-info-200 bg-info-50 p-6">
          <h2 className="mb-2 text-lg font-semibold text-info-900">Admin Notları</h2>
          <p className="whitespace-pre-wrap text-sm text-info-800">{trade.adminNotes}</p>
        </div>
      )}

      {trade.dispute && (
        <SectionCard title="İtiraz">
          <div className="space-y-2">
            <p>
              <span className="font-medium">Neden:</span>{' '}
              {enumLabel(refundReasonConfig, trade.dispute.reason, trade.dispute.reason)}
            </p>
            {trade.dispute.description && (
              <p>
                <span className="font-medium">Açıklama:</span> {trade.dispute.description}
              </p>
            )}
            {trade.dispute.resolution && (
              <div className="mt-3 rounded-lg border border-success-200 bg-success-50 p-3">
                <p className="text-sm text-success-800">
                  <strong>Çözüm:</strong> {trade.dispute.resolution}
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </>
  );
}
