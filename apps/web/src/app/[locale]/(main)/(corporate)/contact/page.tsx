/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import ContactClient from "./_components/ContactClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "İletişim · Tarodan",
    description:
      "Tarodan ekibine ulaşın — sorularınız, önerileriniz ve destek talepleriniz için iletişim formu.",
    alternates: localizedCanonical(locale, "/contact"),
  };
}

export default function ContactPage() {
  return <ContactClient />;
}
