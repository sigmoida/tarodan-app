/** @format */

import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";

/** Amount due + pending badge + SSL note. */
export default function AmountSummaryCard({ amount }: { amount?: number }) {
  return (
    <SectionCard className="p-0" bodyClassName="">
      <div className="flex items-center justify-between gap-4 p-6">
        <div>
          <p className="text-sm text-muted">Ödenecek tutar</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-heading tabular-nums sm:text-4xl">
            {amount?.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span className="text-2xl font-semibold text-muted">TL</span>
          </p>
        </div>
        <Badge variant="warning">Ödeme bekleniyor</Badge>
      </div>
      <div className="flex items-center gap-2 border-t border-success-200/60 bg-success-50 px-6 py-3 text-sm text-muted">
        <ShieldCheckIcon className="h-5 w-5 shrink-0 text-success-500" />
        <span>256-bit SSL ile şifrelenmiş, PayTR güvenceli güvenli ödeme</span>
      </div>
    </SectionCard>
  );
}
