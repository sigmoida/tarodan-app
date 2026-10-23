/** @format */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoostOffer } from "@tarodan/types";
import { usePathname } from "@/i18n/navigation";
import { isPaymentPath } from "@/lib/cspPolicy.mjs";
import { queryKeys } from "@/lib/query/keys";
import { useBoostDialogStore } from "@/stores/boostDialogStore";
import { useOnboardingTourStore } from "@/stores/onboardingTourStore";
import { useRequiredStepsStore } from "@/stores/requiredStepsStore";
import BoostOfferDialog from "./BoostOfferDialog";
import { useBoostLauncher } from "./useBoostLauncher";
import { useBoostOffers, useDismissBoostOffers } from "./useBoostOffers";

/**
 * Checkout steps the offer never interrupts, on top of the card-entry pages
 * (`isPaymentPath`: `/payment/*` and `/cart/payment`, the PCI source). The
 * offer waits there (nothing is dismissed) and shows on the next allowed
 * page. The auth pages need no entry: the `(auth)` group sits outside the
 * `(main)` layout, so the host is never mounted there.
 */
const CHECKOUT_PREFIXES = ["/checkout", "/membership/checkout"];

/** `pathname` is locale-stripped (`usePathname` from `@/i18n/navigation`). */
export function isOfferSuppressedPath(pathname: string): boolean {
  return (
    isPaymentPath(pathname) ||
    CHECKOUT_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

/**
 * Mounted once in the `(main)` layout for signed-in users. Opens the one
 * boost offer dialog when the seller has due listings, on the next page
 * load, route change or tab focus after the approval (realtime is dormant).
 * Choosing a listing closes the offer and opens the boost dialog for it, so
 * the two are never nested; the same launcher renders that dialog. It also
 * waits while any boost dialog (another page's launcher), a required step
 * or the onboarding tour is on screen, and publishes `offerOpen` so the
 * popup ad waits for it in turn.
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
  // mount fetch (`staleTime: 0`), so it is skipped here, and so is a page
  // the offer cannot open on (it asks again on the next allowed one).
  const seenPath = useRef(pathname);
  useEffect(() => {
    if (seenPath.current === pathname) return;
    seenPath.current = pathname;
    if (isOfferSuppressedPath(pathname)) return;
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

  const boostDialogOpen = useBoostDialogStore((s) => s.openDialogs > 0);
  const requiredStepsOutstanding = useRequiredStepsStore((s) => s.outstanding);
  const tourRunning = useOnboardingTourStore((s) => s.running);
  const open =
    offers.length > 0 &&
    !launcher.dialog &&
    !boostDialogOpen &&
    !requiredStepsOutstanding &&
    !tourRunning &&
    !isOfferSuppressedPath(pathname);

  const setOfferOpen = useBoostDialogStore((s) => s.setOfferOpen);
  useEffect(() => {
    setOfferOpen(open);
  }, [open, setOfferOpen]);
  useEffect(() => () => setOfferOpen(false), [setOfferOpen]);

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
