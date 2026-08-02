/** @format */

import type { Metadata } from "next";
import { DocUnderRevision } from "@/components/layout/DocUnderRevision";

/** İçerik yenilenene kadar "Güncelleniyor" yer tutucusu gösterilir. */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Koleksiyoner Rehberi · Tarodan",
    description: "Tarodan koleksiyoner rehberi güncellenmektedir.",
    robots: { index: false },
  };
}

export default function CollectorsGuidePage() {
  return <DocUnderRevision title="Koleksiyoner Rehberi" />;
}
