/** @format */

import type { Metadata } from "next";
import SecureSwapClient from "./_components/SecureSwapClient";

export const metadata: Metadata = {
  title: "Güvenli Takas Sistemi · Tarodan",
  description:
    "Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Nasıl çalıştığını, güvenlik garantilerini ve sıkça sorulan soruları öğrenin.",
  alternates: { canonical: "/secure-swap" },
};

export default function SecureSwapPage() {
  return <SecureSwapClient />;
}
