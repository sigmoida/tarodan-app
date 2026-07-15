/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import CookiesClient from "./_components/CookiesClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
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
