import { useTranslations } from "next-intl";
import { TruckIcon } from "@heroicons/react/24/outline";
import {
  offerStatusConfig,
  orderStatusConfig,
  shipmentProviderConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import {
  ADMIN_ORDER_BUCKET_I18N_KEYS,
  type AdminOrderListRow,
  type AdminOrderPackage,
} from "@tarodan/types";
import { TableBadge } from "@/components/table/TableBadge";
import { STATUS_TONE } from "@/lib/status-tone";
import { statusConfig, statusLabel } from "@/lib/statusLabels";
import { packageOrderStatuses } from "../../_lib/rowView";
import { PackageStack } from "./PackageStack";

function PackageCargo({
  pkg,
  unpaid,
}: {
  pkg: AdminOrderPackage;
  /** The cart's payment never completed: marked once, on its first package. */
  unpaid: boolean;
}) {
  const t = useTranslations();
  const shipment = pkg.shipment;
  const hasRefund = pkg.lines.some((line) => line.hasActiveRefund);
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 py-1">
      {shipment ? (
        <>
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <TruckIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="font-medium text-heading">
              {statusLabel(shipmentProviderConfig, shipment.provider, t)}
            </span>
            {shipment.trackingNumber && (
              <span className="truncate font-mono text-muted">
                {shipment.trackingNumber}
              </span>
            )}
          </span>
          <TableBadge
            status={shipment.status}
            config={statusConfig(shipmentStatusConfig, t)}
          />
        </>
      ) : (
        <span className="text-xs text-subtle">
          {t("admin.operations.orders.cells.noShipment")}
        </span>
      )}
      <div className="flex flex-wrap gap-1">
        {unpaid && (
          <TableBadge variant={STATUS_TONE.ended}>
            {t(ADMIN_ORDER_BUCKET_I18N_KEYS.unpaid)}
          </TableBadge>
        )}
        {packageOrderStatuses(pkg).map((status) => (
          <TableBadge
            key={status}
            status={status}
            config={statusConfig(orderStatusConfig, t)}
          />
        ))}
        {hasRefund && (
          <TableBadge variant="danger">
            {t("admin.operations.orders.status.refundInProgress")}
          </TableBadge>
        )}
      </div>
    </div>
  );
}

/**
 * Last column: per package the carrier, tracking number and shipment status,
 * and the order status of its lines. A cart whose payment never completed
 * (`unpaid` bucket: abandoned checkout, unpaid offer, their expiry cancels)
 * is marked so it is not read as a real order. An offer that never became an
 * order shows the offer's (visible) status.
 */
export function CargoStatusCell({ row }: { row: AdminOrderListRow }) {
  const t = useTranslations();
  if (row.packages.length === 0) {
    return row.offer ? (
      <TableBadge
        status={row.offer.status}
        config={statusConfig(offerStatusConfig, t)}
      />
    ) : null;
  }
  const unpaid = row.bucket === "unpaid";
  const firstKey = row.packages[0].key;
  return (
    <PackageStack
      packages={row.packages}
      body={(pkg) => (
        <PackageCargo pkg={pkg} unpaid={unpaid && pkg.key === firstKey} />
      )}
    />
  );
}
