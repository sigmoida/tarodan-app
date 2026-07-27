/** @format */

import { ClockIcon } from "@heroicons/react/24/outline";

export default function TradeCountdown({
  countdown,
}: {
  countdown: string | null;
}) {
  if (!countdown) return null;
  return (
    <div className="card p-4 mb-6 bg-warning-50 border-warning-200">
      <div className="flex items-center gap-3">
        <ClockIcon className="w-6 h-6 text-warning-600" />
        <div>
          <p className="font-semibold text-primary-800 text-lg font-mono">
            {countdown}
          </p>
          <p className="text-sm text-primary-600">
            Lütfen süre dolmadan işleminizi tamamlayın
          </p>
        </div>
      </div>
    </div>
  );
}
