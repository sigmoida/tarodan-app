/** @format */

"use client";

import { ordersApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import type { OrderSummaryAmounts } from "@/components/order/OrderSummaryLines";

type QuoteItem = { productId?: string; id?: string; quantity?: number };

/**
 * Sepet özetinin satırları — doğrudan `POST /orders/quote` → `pricing.summary`.
 *
 * Sepet hiçbir tutar hesaplamaz, türetmez ya da toplamaz. Eskiden quote'tan
 * yalnız `buyerFeeAmount` alanını çekip toplamı kendi kuruyordu; hizmet KDV'si
 * hesaba hiç girmediği için aynı sepet, sepette ve checkout'ta farklı tutar
 * gösteriyordu. KDV'yi kalemlere API dağıtır (kargonunki kargo satırına,
 * ücretlerinki hizmet bedeline) ve üç satırın toplamının ödenecek tutara eşit
 * olduğu API testinde sabittir.
 *
 * Satır kümesi değiştiğinde yeniden sorgulanır; boş sepet hiç sorgulanmaz.
 * Misafir (offline) satırlar giriş sonrası fiyatlanır.
 */
export function useCartQuote(
  items: QuoteItem[] | undefined,
  couponCode?: string | null,
): OrderSummaryAmounts | null {
  const list = items ?? [];
  // Kupon anahtarın PARÇASI: kupon uygulanınca/kaldırılınca quote yeniden
  // sorgulanmalı, yoksa özet eski indirimsiz tutarı göstermeye devam eder.
  const signature =
    list.map((it) => `${it.productId ?? it.id}:${it.quantity ?? 1}`).join(",") +
    `|coupon:${couponCode ?? ""}`;

  const { data } = useWebList<OrderSummaryAmounts | null>({
    resource: "cart",
    params: ["quote", signature],
    fetcher: async () => {
      const items = list.map((it) => ({
        productId: it.productId ?? it.id!,
        quantity: it.quantity ?? 1,
      }));
      const summaryOf = (res: any) =>
        (res.data?.pricing ?? res.data ?? {}).summary ?? null;

      if (!couponCode) return summaryOf(await ordersApi.getQuote({ items }));

      try {
        return summaryOf(await ordersApi.getQuote({ items, couponCode }));
      } catch {
        // Geçersiz kuponda quote 400 döner ve sepet FİYATSIZ kalırdı. Kuponun
        // geçerliliği CouponBox'ın işi; özetin görevi tutarları göstermek. Bu
        // yüzden kuponsuz yeniden fiyatlanır — kupon uygulanmamış gibi, ama
        // sepet boş görünmez. (Ör. kupon uygulandıktan sonra kapsamdaki ürün
        // sepetten çıkarıldığında bu duruma düşülür.)
        return summaryOf(await ordersApi.getQuote({ items }));
      }
    },
    enabled: list.length > 0,
  });

  return data ?? null;
}
