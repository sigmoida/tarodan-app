import { TruckIcon } from '@heroicons/react/24/outline';
import { enumLabel, shipmentStatusConfig, shipmentProviderConfig } from '@tarodan/ui';
import { SectionCard } from '@/components/detail/SectionCard';
import { DataList, Field } from '@/components/detail/DataList';
import type { OrderDetail } from '../types';
import { hasRealShipment } from '../_lib/status';

/** Kargo kartı — yalnızca gerçek gönderi varken (trackingNumber + kargolanmış). */
export function ShippingSection({
  order,
  isCancelledOrder,
}: {
  order: OrderDetail;
  isCancelledOrder: boolean;
}) {
  if (!hasRealShipment(order, isCancelledOrder) || !order.shipment) return null;

  const isDeliveredOrCompleted = ['delivered', 'completed'].includes(order.status);
  const statusLabel = isDeliveredOrCompleted
    ? 'Teslim Edildi'
    : order.shipment.status
      ? enumLabel(shipmentStatusConfig, order.shipment.status)
      : null;

  return (
    <SectionCard title="Kargo Bilgileri" icon={TruckIcon}>
      <DataList columns={1}>
        <Field label="Takip No">
          <span className="font-mono text-sm">{order.shipment.trackingNumber}</span>
        </Field>
        {order.shipment.carrier && (
          <Field label="Kargo Firması">
            {enumLabel(shipmentProviderConfig, order.shipment.carrier)}
          </Field>
        )}
        {statusLabel && <Field label="Durum">{statusLabel}</Field>}
      </DataList>
    </SectionCard>
  );
}
