/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SecureSwapClient from "./_components/SecureSwapClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Güvenli Takas Sistemi · Tarodan",
    description:
      "Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Nasıl çalıştığını, güvenlik garantilerini ve sıkça sorulan soruları öğrenin.",
    alternates: localizedCanonical(locale, "/secure-swap"),
  };
}

export default function SecureSwapPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  return <SecureSwapClient lang={locale === "en" ? "en" : "tr"} />;
}
