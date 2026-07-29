/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import CookiesClient from "./_components/CookiesClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Çerez Politikası · Tarodan",
    description:
      "TARODAN çerez politikası: hangi çerezleri neden kullandığımız, çerez kategorileri ve tercihlerinizi nasıl yönetebileceğiniz.",
    alternates: localizedCanonical(locale, "/cookies"),
  };
}

export default function CookiesPage() {
  return <CookiesClient />;
}
