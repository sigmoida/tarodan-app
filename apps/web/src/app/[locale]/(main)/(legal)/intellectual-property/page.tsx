/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import IntellectualPropertyClient from "./_components/IntellectualPropertyClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Fikri Mülkiyet · Tarodan",
    description:
      "TARODAN fikri mülkiyet politikası: telif hakkı ve marka kullanımı, ihlal bildirimi süreci ve tekrarlayan ihlallere ilişkin kurallar.",
    alternates: localizedCanonical(locale, "/intellectual-property"),
  };
}

export default function IntellectualPropertyPage() {
  return <IntellectualPropertyClient />;
}
