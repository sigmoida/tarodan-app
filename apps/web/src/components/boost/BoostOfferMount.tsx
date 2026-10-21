/** @format */

"use client";

import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/authStore";

// Loaded for signed-in sellers only: guests and buyers never download the
// offer code nor send its request (a first listing makes the account a
// seller, and the listing form refreshes the profile right after it).
const BoostOfferHost = dynamic(() => import("./BoostOfferHost"), {
  ssr: false,
});

/** The `(main)` layout's single mount point for the boost offer dialog. */
export default function BoostOfferMount() {
  const seller = useAuthStore((s) => s.isAuthenticated && !!s.user?.isSeller);
  return seller ? <BoostOfferHost /> : null;
}
