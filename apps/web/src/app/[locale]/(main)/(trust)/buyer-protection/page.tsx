/** @format */

import type { Metadata } from "next";
import BuyerProtectionClient from "./_components/BuyerProtectionClient";

export const metadata: Metadata = {
  title: "Alıcı Koruma · Tarodan",
  description:
    "TARODAN Alıcı Koruma programı; kapsam, para iadesi, anlaşmazlık çözümü ve haklarınızı özetler.",
  alternates: { canonical: "/buyer-protection" },
};

export default function BuyerProtectionPage() {
  return <BuyerProtectionClient />;
}
