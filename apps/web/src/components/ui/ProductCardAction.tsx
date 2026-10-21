/** @format */

"use client";

import type { ReactNode } from "react";
import { RocketLaunchIcon } from "@heroicons/react/24/outline";
import { Button, IconButton } from "@tarodan/ui";
import { productCardAction, type ProductCardAction } from "@tarodan/types";
import { useTranslations } from "next-intl";
import { useBoostEnabled } from "@/components/boost/useBoostOffers";
import { useBoostLauncher } from "@/components/boost/useBoostLauncher";
import { useHydrated } from "@/hooks/useHydrated";
import { formatDayMonth } from "@/lib/format";
import type { ProductCardListing } from "@/lib/productCardListing";
import { useAuthStore } from "@/stores/authStore";
import ProductCardCartButton from "./ProductCardCartButton";
import {
  CARD_ACTION_ICON_CLASS,
  CARD_ACTION_TEXT_CLASS,
  type CardActionPresentation,
} from "./productCardActionPresentation";

/**
 * The listing card's one action for the current viewer, from the shared rule
 * `productCardAction` (`@tarodan/types`; mobile cards use the same rule):
 *
 * | viewer and listing                            | action                  |
 * | --------------------------------------------- | ----------------------- |
 * | guest, or not the seller; active and in stock | cart toggle             |
 * | the seller; active; boost sales on            | "Öne Çıkar" / "Süre Ekle" (when boosted) |
 * | the seller and boost sales off                | none                    |
 * | sold, inactive or out of stock                | none                    |
 *
 * "Süre Ekle" needs a running boost (`isBoosted`); a paused boost does not
 * count, so it is never offered for a listing that is not live.
 *
 * The viewer is known only in the browser: the server and the first client
 * render use a guest viewer (the cart action), then an own listing switches
 * to the boost action without a hydration mismatch. The boost switch
 * (`GET /products/boost/offers`) is asked only when a card is the viewer's
 * own; `own` also drives the boost end date.
 */
export function useProductCardAction(listing: ProductCardListing): {
  action: ProductCardAction;
  own: boolean;
} {
  const hydrated = useHydrated();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const viewerId = hydrated ? userId : null;
  const own =
    viewerId != null &&
    listing.sellerId != null &&
    listing.sellerId === String(viewerId);
  const boostEnabled = useBoostEnabled({ enabled: own });

  return {
    action: productCardAction(listing, {
      userId: viewerId != null ? String(viewerId) : null,
      canBoost: own && boostEnabled,
    }),
    own,
  };
}

/** "Öne Çıkar" / "Süre Ekle": opens the shared boost dialog for the listing. */
function ProductCardBoostButton({
  listing,
  extend,
  presentation,
}: {
  listing: ProductCardListing;
  extend: boolean;
  presentation: CardActionPresentation;
}) {
  const t = useTranslations();
  const boost = useBoostLauncher();
  const label = extend ? t("product.extendBoost") : t("product.boostListing");
  const ariaLabel = extend
    ? t("product.cardAction.extendAria", { title: listing.title })
    : t("product.cardAction.boostAria", { title: listing.title });
  const open = () =>
    boost.open({
      id: listing.id,
      title: listing.title,
      boostedUntil: listing.boostedUntil,
    });

  return (
    <>
      <IconButton
        variant="warning"
        size="sm"
        onClick={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={CARD_ACTION_ICON_CLASS[presentation]}
      >
        <RocketLaunchIcon className="h-4 w-4" />
      </IconButton>
      <Button
        type="button"
        variant="warning"
        size="sm"
        onClick={open}
        leftIcon={<RocketLaunchIcon className="h-4 w-4" />}
        className={CARD_ACTION_TEXT_CLASS[presentation]}
      >
        {label}
      </Button>
      {boost.dialog}
    </>
  );
}

/** The button for a computed action, or nothing. */
function ProductCardActionButton({
  listing,
  action,
  presentation,
}: {
  listing: ProductCardListing;
  action: ProductCardAction;
  presentation: CardActionPresentation;
}) {
  switch (action.kind) {
    case "add_to_cart":
      return (
        <ProductCardCartButton
          productId={listing.id}
          title={listing.title}
          presentation={presentation}
        />
      );
    case "boost":
      return (
        <ProductCardBoostButton
          listing={listing}
          extend={action.extend}
          presentation={presentation}
        />
      );
    case "none":
      return null;
  }
}

/**
 * The price row of a listing card with the card's action at its right: a
 * client island that takes the (server-renderable) price as `children`.
 *
 * - `grid`: one row, price left, action at the bottom right; it wraps the
 *   action under the price when both do not fit, and keeps one height
 *   (`min-h-8`) on every card of a row, with or without an action. The card
 *   root must be the `@container` for the text/icon switch.
 * - `list`: the list row's right price column; the action sits under the
 *   price from `xs` up, at the end of the price line below it.
 *
 * The action is above the card's stretched title link (`relative z-10`); the
 * price itself is not, so a click on it still opens the listing. An own
 * boosted listing also shows when its boost ends. `withAction={false}` keeps
 * the row and drops the action (non-navigating cards, cards with their own
 * footer action).
 */
export default function ProductCardPriceRow({
  listing,
  layout,
  withAction = true,
  children,
}: {
  listing: ProductCardListing;
  layout: "grid" | "list";
  withAction?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  const { action, own } = useProductCardAction(listing);
  const endsAt =
    own && listing.isBoosted && listing.boostedUntil
      ? formatDayMonth(listing.boostedUntil)
      : "";
  const endDate = endsAt ? (
    <p
      className={
        layout === "grid"
          ? "text-xs text-muted"
          : "order-last basis-full text-xs text-muted xs:order-none xs:basis-auto"
      }
    >
      {t("product.boostEndsAt", { date: endsAt })}
    </p>
  ) : null;
  const button =
    withAction && action.kind !== "none" ? (
      <ProductCardActionButton
        listing={listing}
        action={action}
        presentation={layout === "grid" ? "fit" : "list"}
      />
    ) : null;

  if (layout === "list") {
    return (
      <div className="flex w-full flex-shrink-0 flex-row flex-wrap items-baseline justify-end gap-2 text-right xs:ml-4 xs:w-auto xs:flex-col xs:items-end xs:gap-0">
        {children}
        {endDate}
        {button && (
          <div className="relative z-10 self-center xs:mt-2 xs:self-auto">
            {button}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-8 flex-wrap items-end justify-between gap-x-2 gap-y-1.5 border-t border-border-subtle pt-1.5">
      <div className="min-w-0">
        {children}
        {endDate}
      </div>
      {button && <div className="relative z-10 ml-auto">{button}</div>}
    </div>
  );
}
