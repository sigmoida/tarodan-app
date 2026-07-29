import Link from "next/link";
import { CubeIcon } from "@heroicons/react/24/outline";
import { fmtTry } from "@/lib/format";

export interface ShipmentProductInfo {
  id: string;
  title: string;
  price?: number | null;
  image?: string | null;
  /** Optional secondary line (e.g. category, SKU, quantity). */
  meta?: string | null;
}

/**
 * The product(s) a shipment/cargo actually carries — image + info, clickable
 * through to the product in admin. Used on trade shipment legs and order
 * shipping sections so it's clear WHICH product each cargo code belongs to.
 */
export function ShipmentProducts({
  products,
  label,
}: {
  products: ShipmentProductInfo[];
  label?: string;
}) {
  if (!products?.length) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      {label && (
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
      )}
      <div className="space-y-2">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/catalog/products/${p.id}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2 transition-colors hover:bg-surface-alt"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-alt">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image}
                  alt={p.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <CubeIcon className="h-6 w-6 text-subtle" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-primary-600">
                {p.title}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted">
                {p.price != null && <span>{fmtTry(p.price)}</span>}
                {p.meta && <span className="truncate">{p.meta}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
