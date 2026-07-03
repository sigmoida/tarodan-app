import type { HistoryEntry, RefundRequestDetail } from '../types';
import { TechRow } from '../_components/Field';

export function RefundTechnicalDetails({
  rr,
  history,
}: {
  rr: RefundRequestDetail;
  history: HistoryEntry[];
}) {
  return (
    <details className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      <summary className="cursor-pointer select-none text-sm font-medium text-muted">
        Teknik detaylar
      </summary>
      <div className="mt-4 space-y-2 text-xs">
        <TechRow label="Talep ID" value={rr.id} mono />
        <TechRow label="İade kargo sağlayıcı (ham)" value={rr.returnProvider} mono />
        <TechRow label="Provider Refund ID" value={rr.providerRefundId} mono />
        {history.length > 0 && (
          <div>
            <div className="mb-1 font-medium text-body">Ham işlem geçmişi</div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-surface-alt p-3 text-muted">
              {JSON.stringify(history, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}
