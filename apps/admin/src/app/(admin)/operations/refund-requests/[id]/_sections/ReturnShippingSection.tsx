import { TruckIcon } from '@heroicons/react/24/outline';
import { StatusBadge, enumLabel, shipmentStatusConfig, shipmentProviderConfig } from '@tarodan/ui';
import { payerLabels } from '@/components/refunds/refund-guidance';
import { SectionCard } from '@/components/detail/SectionCard';
import type { RefundRequestDetail } from '../types';
import { fmtDate } from '../_lib/format';
import { Field } from '../_components/Field';

export function ReturnShippingSection({ rr }: { rr: RefundRequestDetail }) {
  const payer = rr.returnShippingPayer ? payerLabels[rr.returnShippingPayer] : null;
  const providerLabel =
    rr.returnProvider === 'manual'
      ? 'Manuel'
      : enumLabel(shipmentProviderConfig, rr.returnProvider ?? undefined, rr.returnProvider ?? '—');

  return (
    <SectionCard title="İade Kargosu" icon={TruckIcon} bodyClassName="space-y-4">
      <p className="text-sm text-muted">
        Alıcı ürünü satıcıya geri gönderir. Ürün satıcıya ulaştığında para iadesi otomatik
        başlatılır.
      </p>

      <div className="rounded-lg bg-surface-alt p-3 text-sm">
        <span className="font-medium text-body">İade kargosunu kim öder? </span>
        {payer ? (
          <>
            <span className="font-semibold">{payer.label}</span>
            <span className="text-muted"> — {payer.helper}</span>
          </>
        ) : (
          <span className="text-muted">
            Henüz belirlenmedi (aşağıdaki “İade Politikası” bölümünden seçin).
          </span>
        )}
      </div>

      {rr.returnTrackingNumber ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          <Field label="Kargo firması">{providerLabel}</Field>
          <Field label="Takip no">
            <span className="font-mono">{rr.returnTrackingNumber}</span>
          </Field>
          <Field label="Kargo durumu">
            {rr.returnStatus ? (
              <StatusBadge status={rr.returnStatus} config={shipmentStatusConfig} />
            ) : (
              '—'
            )}
          </Field>
          <Field label="Kargo oluşturma">{fmtDate(rr.returnCreatedAt)}</Field>
          <Field label="Kargoya verildi">{fmtDate(rr.returnShippedAt)}</Field>
          <Field label="Satıcıya ulaştı">{fmtDate(rr.returnDeliveredAt)}</Field>
        </div>
      ) : (
        <div className="text-sm text-muted">
          İade kargosu henüz oluşturulmadı — talep onaylandığında otomatik açılır.
        </div>
      )}
    </SectionCard>
  );
}
