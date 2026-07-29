/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import ContactClient from "./_components/ContactClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
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
