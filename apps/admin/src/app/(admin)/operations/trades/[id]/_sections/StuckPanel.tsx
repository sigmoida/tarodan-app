import { Button } from '@tarodan/ui';
import { ClockIcon } from '@heroicons/react/24/outline';
import type { TradeDetail } from '../types';

/** Stuck partial-arrival panel — the button opens the force-cancel modal. */
export function StuckPanel({
  trade,
  show,
  onResolve,
}: {
  trade: TradeDetail;
  show: boolean;
  onResolve: () => void;
}) {
  if (!show) return null;

  return (
    <div className="rounded-xl border-2 border-warning-400 bg-warning-50 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ClockIcon className="h-8 w-8 flex-shrink-0 text-warning-700" />
          <div>
            <h2 className="text-lg font-semibold text-warning-900">Sıkışmış Takas</h2>
            <p className="mt-1 text-sm text-warning-800">
              Bir ürün depoya ulaştı (
              {trade.firstWarehouseArrivalAt &&
                new Date(trade.firstWarehouseArrivalAt).toLocaleString('tr-TR')}
              ) ama karşı tarafın kargosu hâlâ yolda. Manuel müdahale gerekiyor: karşı kargoyu
              iptal edip ulaşan ürünü sahibine geri yollayabilirsin.
            </p>
          </div>
        </div>
        <Button variant="danger" onClick={onResolve} className="flex-shrink-0">
          Sıkışmış Takası Çöz
        </Button>
      </div>
    </div>
  );
}
