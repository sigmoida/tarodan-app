/** @format */

"use client";

import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/authStore";

// Loaded for signed-in users only: guests never download the offer code.
const BoostOfferHost = dynamic(() => import("./BoostOfferHost"), {
  ssr: false,
});

/** The `(main)` layout's single mount point for the boost offer dialog. */
export default function BoostOfferMount() {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  return signedIn ? <BoostOfferHost /> : null;
}
