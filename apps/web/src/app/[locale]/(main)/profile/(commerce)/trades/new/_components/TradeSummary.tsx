/** @format */

"use client";

import { getProductEffectivePrice } from "@/lib/productPrice";
import { formatTL } from "@/lib/format";
import type { TradeProduct } from "../_lib/types";

interface TradeSummaryProps {
  target: TradeProduct;
  selectedProducts: TradeProduct[];
  cashAmount: number;
  cashPayer: "me" | "them";
}

export default function TradeSummary({
  target,
  selectedProducts,
  cashAmount,
  cashPayer,
}: TradeSummaryProps) {
  const productsTotal = selectedProducts.reduce(
    (sum, p) => sum + getProductEffectivePrice(p),
    0,
  );
  const total = cashPayer === "me" ? productsTotal + cashAmount : productsTotal;

  return (
    <div className="rounded-lg border border-border bg-surface-alt p-6">
      <h2 className="mb-4 text-lg font-semibold text-heading">Teklif Özeti</h2>
      <div className="space-y-2 text-body">
        <div className="flex justify-between">
          <span>Seçilen Ürünler:</span>
          <span className="font-medium">{selectedProducts.length} adet</span>
        </div>
        <div className="flex justify-between">
          <span>Ürün Toplam Değeri:</span>
          <span className="font-medium">{formatTL(productsTotal)}</span>
        </div>
        {cashAmount > 0 && (
          <div className="flex justify-between">
            <span>
              Nakit Fark
              <span className="ml-1 text-xs text-muted">
                (
                {cashPayer === "me"
                  ? "Siz ödeyeceksiniz"
                  : "Karşı taraf ödeyecek"}
                )
              </span>
            </span>
            <span className="font-medium">{formatTL(cashAmount)}</span>
          </div>
        )}
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex justify-between text-lg font-bold">
            <span>Toplam Teklif:</span>
            <span className="text-primary-600">{formatTL(total)}</span>
          </div>
        </div>
        <div className="flex justify-between text-muted">
          <span>İstenen Ürün:</span>
          <span className="font-medium">
            {formatTL(getProductEffectivePrice(target))}
          </span>
        </div>
      </div>
    </div>
  );
}
