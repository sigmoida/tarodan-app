/** @format */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoostOffer } from "@tarodan/types";
import { usePathname } from "@/i18n/navigation";
import { queryKeys } from "@/lib/query/keys";
import BoostOfferDialog from "./BoostOfferDialog";
import { useBoostLauncher } from "./useBoostLauncher";
import { useBoostOffers, useDismissBoostOffers } from "./useBoostOffers";

/**
 * Paths the offer never covers: payment results, checkout and the auth
 * pages. The offer waits (nothing is dismissed) and shows on the next
 * allowed page.
 */
const SUPPRESSED_PREFIXES = [
  "/payment",
  "/checkout",
  "/login",
  "/register",
  "/corporate",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export function isOfferSuppressedPath(pathname: string): boolean {
  return SUPPRESSED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Mounted once in the `(main)` layout for signed-in users. Opens the one
 * boost offer dialog when the seller has due listings, on the next page
 * load, route change or tab focus after the approval (realtime is dormant).
 * Choosing a listing closes the offer and opens the boost dialog for it, so
 * the two are never nested; the same launcher renders that dialog.
 *
 * Dismissal rule: closing, "Şimdi değil" or choosing one dismisses every
 * listed offer. The ids are also kept for this session, so a failed dismiss
 * request (silent) or a refetch that races it cannot reopen the dialog; the
 * server still has them due and offers them again after a full reload.
 */
export default function BoostOfferHost() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const launcher = useBoostLauncher();
  const { data } = useBoostOffers({ live: true });
  const dismissOffers = useDismissBoostOffers();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  // A new page is a chance to learn about an approval. The first run is the
  // mount fetch (`staleTime: 0`), so it is skipped here.
  const seenPath = useRef(pathname);
  useEffect(() => {
    if (seenPath.current === pathname) return;
    seenPath.current = pathname;
    void queryClient.invalidateQueries({ queryKey: queryKeys.boost.offers() });
  }, [pathname, queryClient]);

  const offers = useMemo(
    () =>
      data?.enabled ? data.offers.filter((o) => !hidden.has(o.productId)) : [],
    [data, hidden],
  );

  const dismissAll = useCallback(() => {
    const ids = offers.map((o) => o.productId);
    setHidden((prev) => new Set([...prev, ...ids]));
    dismissOffers(ids);
  }, [offers, dismissOffers]);

  const choose = (offer: BoostOffer) => {
    dismissAll();
    launcher.open({ id: offer.productId, title: offer.title });
  };

  const open =
    offers.length > 0 && !launcher.dialog && !isOfferSuppressedPath(pathname);

  return (
    <>
      {open && (
        <BoostOfferDialog
          offers={offers}
          onDismiss={dismissAll}
          onChoose={choose}
        />
      )}
      {launcher.dialog}
    </>
  );
}
