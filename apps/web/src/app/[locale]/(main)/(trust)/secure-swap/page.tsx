/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SecureSwapClient from "./_components/SecureSwapClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Güvenli Takas Sistemi · Tarodan",
    description:
      "Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Nasıl çalıştığını, güvenlik garantilerini ve sıkça sorulan soruları öğrenin.",
    alternates: localizedCanonical(locale, "/secure-swap"),
  };
}

export default async function SecureSwapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <SecureSwapClient lang={locale === "en" ? "en" : "tr"} />;
}
