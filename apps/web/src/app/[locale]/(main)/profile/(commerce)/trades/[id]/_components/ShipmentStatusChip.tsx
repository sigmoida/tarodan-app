/** @format */

import { SHIPMENT_STATUS_CHIP } from "../_lib/types";

export default function ShipmentStatusChip({
  status,
}: {
  status?: string | null;
}) {
  const meta = (status && SHIPMENT_STATUS_CHIP[status]) || {
    label: "Beklemede",
    className: "bg-surface-muted text-muted border border-border-subtle",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
    >
      {meta.icon ? <span>{meta.icon}</span> : null}
      {meta.label}
    </span>
  );
}
