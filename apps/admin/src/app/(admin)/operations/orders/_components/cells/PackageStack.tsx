import type { ReactNode } from "react";
import type { AdminOrderLine, AdminOrderPackage } from "@tarodan/types";
import { packageBlockMinHeight } from "../../_lib/rowView";

/**
 * Paket bloklarını alt alta dizen iskelet. Ürün, satıcı, birim fiyat, fatura
 * ve kargo kolonları AYNI iskeleti kullanır: her paket bloğu kalem başına sabit
 * yükseklikte satır taşır, böylece çok satıcılı bir sepette kalemler ve
 * paketler kolonlar boyunca hizalı kalır.
 *
 * Kolon ya kalem bazında (`line`) ya da paket bazında (`body`) içerik verir.
 */
export function PackageStack({
  packages,
  line,
  body,
}: {
  packages: readonly AdminOrderPackage[];
  line?: (line: AdminOrderLine, pkg: AdminOrderPackage) => ReactNode;
  body?: (pkg: AdminOrderPackage) => ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col divide-y divide-border-subtle">
      {packages.map((pkg) => (
        <div
          key={pkg.key}
          className="min-w-0"
          style={{ minHeight: packageBlockMinHeight(pkg) }}
        >
          {line
            ? pkg.lines.map((item) => (
                <div
                  key={item.orderId}
                  className="flex h-16 min-w-0 items-center"
                >
                  {line(item, pkg)}
                </div>
              ))
            : body?.(pkg)}
        </div>
      ))}
    </div>
  );
}
