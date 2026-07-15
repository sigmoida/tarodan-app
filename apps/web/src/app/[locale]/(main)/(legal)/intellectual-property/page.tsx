/** @format */

import type { Metadata } from "next";
import IntellectualPropertyClient from "./_components/IntellectualPropertyClient";

export const metadata: Metadata = {
  title: "Fikri Mülkiyet · Tarodan",
  description:
    "TARODAN fikri mülkiyet politikası: telif hakkı ve marka kullanımı, ihlal bildirimi süreci ve tekrarlayan ihlallere ilişkin kurallar.",
  alternates: { canonical: "/intellectual-property" },
};

export default function IntellectualPropertyPage() {
  return <IntellectualPropertyClient />;
}
