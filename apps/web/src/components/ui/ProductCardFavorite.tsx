/** @format */

"use client";

import type { MouseEvent } from "react";
import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useProductFavorite } from "@/hooks/useWishlist";
import { useAuthStore } from "@/stores/authStore";

/**
 * Ürün kartlarındaki favori kalbi (`ProductCard` grid + liste, `HomeProductCard`).
 * Kartın görsel alanının SAĞ ALT köşesine oturur — sol üst rozetler ve sağ üst
 * indirim rozetiyle çakışmaz — ve hover'a bağlı değildir (dokunmatikte de görünür).
 *
 * Kartın `<Link>`'inin İÇİNE konmaz (link içinde buton geçersiz HTML): kart
 * bunu linkin kardeşi olarak, görsel alanını kaplayan `frameClassName`
 * çerçevesiyle konumlar. Çerçeve tıklamayı geçirir; yalnız buton yakalar.
 *
 * Prop'lar bilinçli olarak ilkel: sunucu kartından (`HomeProductCard`) bu istemci
 * adasına geçen RSC yükü bütün ürün nesnesini taşımaz.
 *
 * Kendi ilanında kalp hiç çizilmez; misafirde favori sorgusu atılmaz, tıklama
 * giriş penceresini açar. Durum ve toggle ilan detayıyla AYNI hook'tan gelir.
 */
export default function ProductCardFavorite({
  productId,
  sellerId,
  frameClassName = "inset-x-0 top-0 aspect-square",
}: {
  productId: string | number;
  /** İlanın satıcısı (`seller.id` ?? `sellerId`); kendi ilanında kalp gizlenir. */
  sellerId?: string | number | null;
  /**
   * Görsel alanını kaplayan mutlak konumlu çerçeve. Varsayılan: kartın üstünde
   * tam genişlikte kare görsel (grid kartları); liste düzeni kendi ölçüsünü verir.
   */
  frameClassName?: string;
}) {
  const t = useTranslations();
  const userId = useAuthStore((s) => s.user?.id);
  const { requireAuth, authModal } = useAuthGate();

  const isOwner =
    !!userId && sellerId != null && String(sellerId) === String(userId);
  const { isFavorite, toggle } = useProductFavorite(String(productId), {
    isOwner,
    requireAuth,
  });

  if (isOwner) return null;

  const label = isFavorite
    ? t("product.removeFromFavorites")
    : t("product.addToFavorites");

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Kartın linki (ve tıklama sayacı) tetiklenmesin.
    event.preventDefault();
    event.stopPropagation();
    toggle();
  };

  return (
    <div className={`pointer-events-none absolute z-10 ${frameClassName}`}>
      <IconButton
        size="sm"
        onClick={onClick}
        aria-label={label}
        aria-pressed={isFavorite}
        title={label}
        className="pointer-events-auto absolute bottom-1.5 right-1.5 rounded-full bg-surface-elevated/80 text-heading shadow-sm hover:bg-surface-elevated"
      >
        {isFavorite ? (
          <HeartSolidIcon className="h-5 w-5 text-danger-500" />
        ) : (
          <HeartIcon className="h-5 w-5" />
        )}
      </IconButton>
      {authModal}
    </div>
  );
}
