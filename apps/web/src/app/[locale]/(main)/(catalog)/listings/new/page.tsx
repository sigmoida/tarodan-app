/** @format */

import type { Metadata } from "next";
import NewListingClient from "./NewListingClient";

export const metadata: Metadata = {
  title: "İlan Oluştur | Tarodan",
  description: "Yeni bir diecast ilanı oluşturun.",
  robots: { index: false, follow: false },
};

export default function NewListingPage() {
  return <NewListingClient />;
}
