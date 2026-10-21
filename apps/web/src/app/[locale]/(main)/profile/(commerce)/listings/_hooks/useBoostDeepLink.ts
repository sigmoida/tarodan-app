/** @format */

"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { BoostListing } from "@/components/boost/BoostModal";
import { useMyListings } from "./useMyListings";

/** The query parameter that asks My listings to open the boost dialog. */
export const BOOST_PARAM = "boost";

/**
 * `/profile/listings?boost=<productId>` (the payment-fail "Tekrar dene" link)
 * opens the boost dialog for that listing once, then clears the parameter.
 * Only the viewer's own active listings open it; any other id is ignored (the
 * parameter is still cleared). Own-ness comes from the viewer's own listings,
 * so a foreign or unknown id never reaches the dialog.
 */
export function useBoostDeepLink(
  ready: boolean,
  open: (listing: BoostListing) => void,
) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const productId = searchParams.get(BOOST_PARAM);
  const handled = useRef<string | null>(null);

  // Same key as the page's "all" tab, so this is one request at most.
  const { listings, isLoading } = useMyListings("all", ready && !!productId);

  useEffect(() => {
    if (!ready || !productId || isLoading || handled.current === productId)
      return;
    handled.current = productId;

    const listing = listings.find((l) => l.id === productId);
    if (listing?.status === "active") {
      open({
        id: listing.id,
        title: listing.title,
        boostedUntil: listing.boostedUntil ?? null,
      });
    }

    const rest = new URLSearchParams(searchParams.toString());
    rest.delete(BOOST_PARAM);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [
    ready,
    productId,
    isLoading,
    listings,
    open,
    searchParams,
    pathname,
    router,
  ]);
}
