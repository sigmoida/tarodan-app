import type { OrderShipmentRow, PhysicalShipmentRow } from "./types";

/**
 * Dedupe key for a raw shipment row → identifies the PHYSICAL parcel it belongs
 * to. Prefer the per-seller `packageId` (same-seller orders in a checkout group
 * ship as one parcel). Legacy rows without a package fall back to
 * provider+tracking (the shared barcode). If neither exists (no package, no
 * tracking yet) the row stands alone, keyed by its own shipment id.
 */
function parcelKey(r: OrderShipmentRow): string {
  if (r.order?.packageId) return `pkg:${r.order.packageId}`;
  const tracking = r.providerTrackingId || r.trackingNumber;
  if (tracking) return `trk:${r.provider ?? ""}:${tracking}`;
  return `ship:${r.id}`;
}

/**
 * Collapse raw per-order `Shipment` rows into physical parcels. Siblings sharing
 * a parcel key merge into one row that carries every order line-item; a 2-seller
 * / 3-product cart yields 2 rows (one parcel per seller), not 3.
 *
 * First-seen order is preserved, so the server's sort/pagination still drives the
 * list — merging only removes duplicate parcel rows within the page.
 */
export function toPhysicalShipments(
  rows: OrderShipmentRow[],
): PhysicalShipmentRow[] {
  const byKey = new Map<string, PhysicalShipmentRow>();
  const order: string[] = [];

  for (const r of rows) {
    const key = parcelKey(r);
    let parcel = byKey.get(key);
    if (!parcel) {
      parcel = {
        id: key,
        provider: r.provider,
        trackingNumber: r.trackingNumber,
        providerTrackingId: r.providerTrackingId,
        trackingUrl: r.trackingUrl,
        status: r.status,
        buyer: r.order?.buyer ?? null,
        seller: r.order?.seller ?? null,
        items: [],
      };
      byKey.set(key, parcel);
      order.push(key);
    }
    if (r.order) {
      parcel.items.push({
        orderId: r.order.id,
        orderNumber: r.order.orderNumber,
        productTitle: r.order.product?.title ?? null,
        quantity: r.order.quantity ?? 1,
      });
    }
  }

  return order.map((k) => byKey.get(k)!);
}
