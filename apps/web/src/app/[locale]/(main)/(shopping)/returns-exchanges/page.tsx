/** @format */

import type { Metadata } from "next";
import ReturnsExchangesClient from "./_components/ReturnsExchangesClient";

export const metadata: Metadata = {
  title: "İade ve Değişim · Tarodan",
  description:
    "Tarodan iade ve değişim politikası, iade adımları ve iade süreleri hakkında bilmeniz gereken her şey.",
  alternates: { canonical: "/returns-exchanges" },
};

export default function ReturnsExchangesPage() {
  return <ReturnsExchangesClient />;
}
