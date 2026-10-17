/** @format */

"use client";

import type { MouseEvent } from "react";
import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useProductFavorite } from "@/hooks/useWishlist";
import { FAVORITE_BUSY_CLASS, favoriteBusyProps } from "@/lib/favorite-busy";
import { useAuthStore } from "@/stores/authStore";

/**
 * Ürün kartlarındaki favori kalbi (`ProductCard` grid + liste, `HomeProductCard`).
 * Kartın görsel alanının SAĞ ÜST köşesine oturur — sol üst rozet yığınıyla
 * çakışmaz (yığın kalp payı bırakır; kartta sağ üst `overlay` varsa kalp hiç
 * çizilmez) — ve hover'a bağlı değildir (dokunmatikte de görünür).
 *
 * Kartın `<Link>`'inin İÇİNE konmaz (link içinde buton geçersiz HTML): kart
 * bunu linkin dışında, görsel alanını birebir kaplayan `frameClassName`
 * çerçevesiyle konumlar. Çerçeve tıklamayı geçirir; yalnız buton yakalar.
 * Görünür daire 32px; dokunma alanı bir `::after` ile 44px'e genişler ve
 * görselin kenarında biter (karta taşmaz).
 *
 * Etiket sabittir ("Favori"); durumu `aria-pressed` söyler — ikisi birden
 * değişirse ekran okuyucu "Favorilerden çıkar, basılı" gibi çelişik okur.
 *
 * Prop'lar bilinçli olarak ilkel: sunucu kartından (`HomeProductCard`) bu istemci
 * adasına geçen RSC yükü bütün ürün nesnesini taşımaz.
 *
 * Kendi ilanında kalp hiç çizilmez; misafirde favori sorgusu atılmaz, tıklama
 * giriş penceresini açar. Durum ve toggle ilan detayıyla AYNI hook'tan gelir;
 * istek sürerken kalp meşgul görünür (`aria-busy`, ikinci tıklama yok sayılır).
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
   * tam genişlikte kare görsel (grid kartları); liste düzeni kalbi görselin
   * kendi hücresine koyar ve `inset-0` verir.
   */
  frameClassName?: string;
}) {
  const t = useTranslations();
  const userId = useAuthStore((s) => s.user?.id);
  const { requireAuth, authModal } = useAuthGate();

  const isOwner =
    !!userId && sellerId != null && String(sellerId) === String(userId);
  const { isFavorite, isPending, toggle } = useProductFavorite(
    String(productId),
    {
      isOwner,
      requireAuth,
    },
  );

  if (isOwner) return null;

  const label = t("product.favorite");

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
        {...favoriteBusyProps(isPending)}
        title={label}
        // `after:-inset-1.5`: 32px + 2×6px = 44px dokunma alanı; buton
        // görselin kenarından 6px içeride, alan tam kenarda biter.
        className={`pointer-events-auto absolute top-1.5 right-1.5 rounded-full bg-surface-elevated/80 text-heading shadow-sm after:absolute after:-inset-1.5 after:rounded-full hover:bg-surface-elevated ${FAVORITE_BUSY_CLASS}`}
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
