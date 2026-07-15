/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import AuthenticityClient from "./_components/AuthenticityClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Orijinallik Garantisi · Tarodan",
    description:
      "Tarodan doğrulama süreci, sahtecilik önlemleri ve doğrulanmış satıcı rozetleri ile güvenli alışverişi nasıl sağladığını açıklar.",
    alternates: localizedCanonical(locale, "/authenticity"),
  };
}

export default function AuthenticityPage() {
  return <AuthenticityClient />;
}
