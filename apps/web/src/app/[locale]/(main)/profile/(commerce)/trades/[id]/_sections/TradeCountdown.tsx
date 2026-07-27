/** @format */

import { ClockIcon } from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";

export default function TradeCountdown({
  countdown,
}: {
  countdown: string | null;
}) {
  if (!countdown) return null;
  return (
    <Alert
      variant="warning"
      icon={<ClockIcon className="h-6 w-6 text-warning-600" />}
      title="Kalan süre"
      className="mb-6"
    >
      <p className="font-mono text-lg font-bold text-warning-800">
        {countdown}
      </p>
      <p className="text-warning-700">
        Lütfen süre dolmadan işleminizi tamamlayın
      </p>
    </Alert>
  );
}
