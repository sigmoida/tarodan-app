import { useTranslations } from "next-intl";
import { TruckIcon } from "@heroicons/react/24/outline";
import {
  Badge,
  offerStatusConfig,
  orderStatusConfig,
  shipmentProviderConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import type { AdminOrderListRow, AdminOrderPackage } from "@tarodan/types";
import { statusConfig, statusLabel } from "@/lib/statusLabels";
import { packageOrderStatuses } from "../../_lib/rowView";
import { PackageStack } from "./PackageStack";

function PackageCargo({ pkg }: { pkg: AdminOrderPackage }) {
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
          <Badge
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
        {packageOrderStatuses(pkg).map((status) => (
          <Badge
            key={status}
            status={status}
            config={statusConfig(orderStatusConfig, t)}
          />
        ))}
        {hasRefund && (
          <Badge variant="danger">
            {t("admin.operations.orders.status.refundInProgress")}
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * Son kolon: paket başına taşıyıcı, takip no ve kargo durumu ile kalemlerin
 * sipariş durumu. Siparişe dönmemiş teklifte teklifin (görünen) durumu.
 */
export function CargoStatusCell({ row }: { row: AdminOrderListRow }) {
  const t = useTranslations();
  if (row.packages.length === 0) {
    return row.offer ? (
      <Badge
        status={row.offer.status}
        config={statusConfig(offerStatusConfig, t)}
      />
    ) : null;
  }
  return (
    <PackageStack
      packages={row.packages}
      body={(pkg) => <PackageCargo pkg={pkg} />}
    />
  );
}
