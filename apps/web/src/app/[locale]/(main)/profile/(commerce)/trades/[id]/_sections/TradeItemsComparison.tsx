/** @format */

import { Link } from "@/i18n/navigation";
import OptimizedImage from "@/components/OptimizedImage";
import { formatTL } from "@/lib/format";
import {
  calculateTotalValue,
  getItemImage,
  type TradeItem,
} from "../../_lib/types";
import { TradeSwapBadge } from "../../_components/TradeSwapBadge";

function ItemColumn({
  heading,
  items,
  tradeId,
  logPage,
}: {
  heading: string;
  items: TradeItem[];
  tradeId: string;
  logPage: string;
}) {
  return (
    <div className="card p-6 flex-1">
      <h2 className="text-xl font-semibold mb-4">{heading}</h2>
      <div className="space-y-3 mb-4 max-h-[280px] overflow-y-auto">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/listings/${item.productId}`}
            className="group/item flex items-center gap-3 rounded-lg p-2 transition-colors"
          >
            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-border-subtle flex-shrink-0">
              <OptimizedImage
                src={getItemImage(item)}
                alt={item.productTitle}
                fill
                className="object-cover"
                sizes="64px"
                fallbackSrc="https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün"
                logContext={{
                  tradeId,
                  itemId: item.id,
                  page: logPage,
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-heading truncate transition-colors group-hover/item:text-primary-600">
                {item.productTitle}
              </p>
              <p className="text-sm text-muted">
                {item.quantity}x • {formatTL(item.valueAtTrade)}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="pt-4 border-t">
        <p className="text-sm text-muted">Toplam Değer</p>
        <p className="text-2xl font-bold text-heading">
          {formatTL(calculateTotalValue(items))}
        </p>
      </div>
    </div>
  );
}

export default function TradeItemsComparison({
  theirItems,
  myItems,
  theirName,
  tradeId,
}: {
  theirItems: TradeItem[];
  myItems: TradeItem[];
  theirName: string;
  tradeId: string;
}) {
  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-6 mb-6">
      {/* SOL - Karşı Tarafın Ürünü */}
      <ItemColumn
        heading={`${theirName}'in Ürünü`}
        items={theirItems}
        tradeId={tradeId}
        logPage="trade-detail-their"
      />

      {/* ORTA - Takas İkonu */}
      <div className="flex items-center justify-center py-4 lg:py-0">
        <TradeSwapBadge size="lg" />
      </div>

      {/* SAĞ - Benim Teklifim */}
      <ItemColumn
        heading="Sizin Teklifiniz"
        items={myItems}
        tradeId={tradeId}
        logPage="trade-detail-mine"
      />
    </div>
  );
}
