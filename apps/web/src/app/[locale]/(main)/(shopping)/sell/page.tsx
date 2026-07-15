/** @format */

import type { Metadata } from "next";
import SellClient from "./_components/SellClient";

export const metadata: Metadata = {
  title: "Burada Satış Yapın · Tarodan",
  description:
    "Model araba koleksiyonunuzu Tarodan üzerinde satışa çıkarın; güvenli ödeme ve geniş alıcı kitlesiyle buluşun.",
  alternates: { canonical: "/sell" },
};

export default function SellPage() {
  return <SellClient />;
}
