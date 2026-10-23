/** @format */

"use client";

import { ShoppingCartIcon } from "@heroicons/react/24/outline";
import { ShoppingCartIcon as ShoppingCartSolidIcon } from "@heroicons/react/24/solid";
import { Button, IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useCartToggle } from "@/hooks/useCartToggle";
import { useHydrated } from "@/hooks/useHydrated";
import { FAVORITE_BUSY_CLASS, favoriteBusyProps } from "@/lib/favorite-busy";
import {
  CARD_ACTION_ICON_CLASS,
  CARD_ACTION_TEXT_CLASS,
  type CardActionPresentation,
} from "./productCardActionPresentation";

/**
 * The listing card's cart toggle: "Sepete Ekle", or "Sepetten Çıkar" when
 * the listing is already in the cart (D10). The grid card's price row, the
 * list card and the Favorites footer all render this one button.
 *
 * - `fit` / `list`: icon-only on a narrow card, text on a wide one (see
 *   `productCardActionPresentation`). Not in the cart: `outline-primary`
 *   with the outline icon; in the cart: filled `primary` with the solid
 *   icon. The icon-only toggle names the listing (`product.cardAction.*Aria`,
 *   also its `title`) and says its state with `aria-pressed` and the
 *   outline/solid fill, so colour is not the only cue.
 * - `full`: a full-width text button (the Favorites footer), `primary` to
 *   add and `danger` to remove.
 *
 * The in-cart state needs the browser (the guest cart is in local storage),
 * so the first render shows "Sepete Ekle" like the server HTML did. While the
 * write runs the button looks busy and ignores clicks; it is never natively
 * `disabled`, which would let a click fall through to the card's link.
 */
export default function ProductCardCartButton({
  productId,
  title,
  presentation,
}: {
  productId: string;
  title: string;
  presentation: CardActionPresentation | "full";
}) {
  const t = useTranslations();
  const hydrated = useHydrated();
  const cart = useCartToggle(productId);
  const inCart = hydrated && cart.inCart;
  const busy = favoriteBusyProps(cart.isPending);
  const label = inCart ? t("product.removeFromCart") : t("product.addToCart");

  if (presentation === "full") {
    return (
      <Button
        type="button"
        variant={inCart ? "danger" : "primary"}
        onClick={cart.toggle}
        {...busy}
        className={`flex w-full gap-1.5 py-1.5 text-xs sm:gap-2 sm:py-2 sm:text-sm ${FAVORITE_BUSY_CLASS}`}
      >
        <ShoppingCartIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        {label}
      </Button>
    );
  }

  const ariaLabel = inCart
    ? t("product.cardAction.removeFromCartAria", { title })
    : t("product.cardAction.addToCartAria", { title });
  const Icon = inCart ? ShoppingCartSolidIcon : ShoppingCartIcon;
  const variant = inCart ? "primary" : "outline-primary";

  return (
    <>
      <IconButton
        variant={variant}
        size="sm"
        onClick={cart.toggle}
        aria-label={ariaLabel}
        aria-pressed={inCart}
        title={ariaLabel}
        {...busy}
        className={`${CARD_ACTION_ICON_CLASS[presentation]} ${FAVORITE_BUSY_CLASS}`}
      >
        <Icon className="h-4 w-4" />
      </IconButton>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={cart.toggle}
        leftIcon={<Icon className="h-4 w-4" />}
        {...busy}
        className={`${CARD_ACTION_TEXT_CLASS[presentation]} ${FAVORITE_BUSY_CLASS}`}
      >
        {label}
      </Button>
    </>
  );
}
