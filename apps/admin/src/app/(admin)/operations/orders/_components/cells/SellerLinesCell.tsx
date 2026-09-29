import type { AdminOrderListRow } from "@tarodan/types";
import {
  packageSellerSlot,
  sellerSlots,
  type SellerSlot,
} from "../../_lib/rowView";
import { PackageStack } from "./PackageStack";
import { PartyInline } from "./PartyCell";

/** Tek yuva: satıcı (ad + kullanıcı kodu) ve hemen altında paket numarası. */
function SellerSlotView({ seller, packageNumber }: Omit<SellerSlot, "key">) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-sm leading-tight">
      <PartyInline party={seller} />
      {packageNumber ? (
        <span className="truncate font-mono text-xs text-muted">
          {packageNumber}
        </span>
      ) : (
        <span className="text-xs text-subtle">—</span>
      )}
    </div>
  );
}

/**
 * Satıcı kolonu, ürün kolonuyla kalem kalem hizalı: HER kalemin yuvasında
 * satıcısı ve paket numarası (aynı satıcının üç kalemi → üç yuva). Siparişler
 * ve İptaller tabloları bu hücreyi paylaşır. Paketi olmayan teklif satırında
 * teklifin satıcısı gösterilir.
 */
export function SellerLinesCell({
  row,
}: {
  row: Pick<AdminOrderListRow, "packages" | "offer">;
}) {
  if (row.packages.length === 0) {
    return (
      <div className="flex min-w-0 flex-col">
        {sellerSlots(row).map(({ key, ...slot }) => (
          <div key={key} className="flex h-16 min-w-0 items-center">
            <SellerSlotView {...slot} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <PackageStack
      packages={row.packages}
      line={(_line, pkg) => <SellerSlotView {...packageSellerSlot(pkg)} />}
    />
  );
}
