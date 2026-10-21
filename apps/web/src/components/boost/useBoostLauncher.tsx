/** @format */

"use client";

import { useCallback, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/authStore";
import { hasPaidMembership } from "@/lib/membership";
import type { BoostListing } from "./BoostModal";

// The dialog's code loads on the first opening only: entry points sit on
// pages (and later on listing cards) that most visitors never boost from.
const BoostModal = dynamic(() => import("./BoostModal"), { ssr: false });

export interface BoostLauncher {
  /** Opens the boost dialog for this listing. */
  open: (listing: BoostListing) => void;
  /** The dialog while one is open, else null; render it once, anywhere. */
  dialog: ReactNode;
}

/**
 * The one way to open the boost dialog, whatever the entry point (My
 * listings, the listing card action, My boosts "Süre Ekle", the offer dialog,
 * the payment-fail "Tekrar dene" deep link). The caller renders `dialog`; each
 * opening mounts a fresh dialog, so the consents never carry over. The
 * reminder is offered to paid members (`hasPaidMembership`, the same rule as
 * the API's `isPremiumEntitled`).
 */
export function useBoostLauncher(): BoostLauncher {
  const [listing, setListing] = useState<BoostListing | null>(null);
  const canRemind = useAuthStore((s) =>
    hasPaidMembership(s.user?.membershipTier),
  );
  const close = useCallback(() => setListing(null), []);

  return {
    open: setListing,
    dialog: listing ? (
      <BoostModal
        key={listing.id}
        listing={listing}
        canRemind={canRemind}
        onClose={close}
      />
    ) : null,
  };
}
