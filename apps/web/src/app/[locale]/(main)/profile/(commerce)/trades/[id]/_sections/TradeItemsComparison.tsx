/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import OptimizedImage from "@/components/OptimizedImage";
import { formatTL } from "@/lib/format";
import {
  calculateTotalValue,
  getItemImage,
  type TradeItem,
} from "../../_lib/types";
import { TradeSwapBadge } from "../../_components/TradeSwapBadge";
import { useTranslations } from "next-intl";
import { imagePlaceholder } from "@/lib/placeholder";

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
  const t = useTranslations();
  return (
    // `min-w-0`: `lg`de iki kolon yan yana geliyor ve tam o kırılımda profil
    // kenar çubuğu da açılıyor, yani ana sütun en dar hâlinde. `flex-1` tek
    // başına küçülmeye izin vermediği için (varsayılan `min-width:auto`) satır
    // 1024px'te taşıyordu — 320/768/1536'da kolonlar alt alta ya da bol alanda
    // olduğu için sorun yalnız orada görünüyordu.
    <div className="card p-6 flex-1 min-w-0">
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
                fallbackSrc={imagePlaceholder("64x64")}
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
        <p className="text-sm text-muted">
          {t("page.trades.tradeitemscomparison.toplamDeger")}
        </p>
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
  const t = useTranslations();
  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-6 mb-6">
      {/* SOL - Karşı Tarafın Ürünü */}
      <ItemColumn
        heading={t("page.trades.tradeitemscomparison.theirnameInUrunu", {
          theirName,
        })}
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
        heading={t("page.trades.tradeitemscomparison.sizinTeklifiniz")}
        items={myItems}
        tradeId={tradeId}
        logPage="trade-detail-mine"
      />
    </div>
  );
}
