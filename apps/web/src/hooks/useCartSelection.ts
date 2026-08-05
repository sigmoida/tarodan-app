/** @format */

"use client";

import { useCallback, useMemo } from "react";
import { useCartStore } from "@/stores/cartStore";

/**
 * Sepet satırı seçimi — sepet ekranındaki kutucuklar ve ödemeye taşınacak
 * kapsam TEK kaynaktan çıkar.
 *
 * Seçim state'i "hariç tutulanlar" olarak saklanır (`cartStore`): sepete yeni
 * eklenen ürün hiçbir şey yapılmadan seçili gelir, yalnız kullanıcının bilerek
 * çıkardıkları hatırlanır. Satın alınamaz satırlar (tükenen/pasif ürün) hiçbir
 * zaman seçilebilir değildir — ödeme onları zaten reddederdi.
 */

export interface SelectableLine {
  productId: string;
  isAvailable?: boolean;
}

export function useCartSelection<T extends SelectableLine>(lines: T[]) {
  const excludedProductIds = useCartStore((s) => s.excludedProductIds);
  const toggleProductSelected = useCartStore((s) => s.toggleProductSelected);
  const setProductsSelected = useCartStore((s) => s.setProductsSelected);

  const selectableIds = useMemo(
    () => lines.filter((l) => l.isAvailable !== false).map((l) => l.productId),
    [lines],
  );

  const isSelected = useCallback(
    (productId: string) => !excludedProductIds.includes(productId),
    [excludedProductIds],
  );

  const selectedLines = useMemo(
    () =>
      lines.filter(
        (l) =>
          l.isAvailable !== false && !excludedProductIds.includes(l.productId),
      ),
    [lines, excludedProductIds],
  );

  const allSelected =
    selectableIds.length > 0 && selectedLines.length === selectableIds.length;

  const toggleAll = useCallback(
    () => setProductsSelected(selectableIds, !allSelected),
    [setProductsSelected, selectableIds, allSelected],
  );

  return {
    isSelected,
    selectedLines,
    selectedCount: selectedLines.length,
    selectableCount: selectableIds.length,
    allSelected,
    toggleLine: toggleProductSelected,
    toggleAll,
  };
}

/**
 * Ödemeye taşınan kapsam.
 *
 * `buyNow` aktifken ("Hemen Al" ile gelindi) yalnız o ürün ödenir; sepetteki
 * kalıcı seçim BOZULMAZ, kullanıcı vazgeçip sepete dönerse eski seçimi durur.
 * Aksi halde kapsam sepetteki seçili satırlardır.
 *
 * `buyNow` işaretli gelinip mağazada o ürün yoksa (ör. kullanıcı sepetten
 * silmiş) kapsam BOŞ döner: sessizce sepetin tamamını tahsil etmektense ödeme
 * ekranı "seçili ürün yok" demeli.
 */
export function useCheckoutScope<T extends SelectableLine>(
  lines: T[],
  buyNowRequested: boolean,
): { scopedLines: T[]; isBuyNow: boolean } {
  const buyNowProductId = useCartStore((s) => s.buyNowProductId);
  const { selectedLines } = useCartSelection(lines);

  const isBuyNow = buyNowRequested && !!buyNowProductId;

  const scopedLines = useMemo(() => {
    if (!isBuyNow) return selectedLines;
    return lines.filter(
      (l) => l.isAvailable !== false && l.productId === buyNowProductId,
    );
  }, [isBuyNow, lines, buyNowProductId, selectedLines]);

  return { scopedLines, isBuyNow };
}
