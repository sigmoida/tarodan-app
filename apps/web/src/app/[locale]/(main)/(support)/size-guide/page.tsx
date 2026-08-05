/** @format */

import type { Metadata } from "next";
import { DocUnderRevision } from "@/components/layout/DocUnderRevision";

/** İçerik yenilenene kadar "Güncelleniyor" yer tutucusu gösterilir. */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Ölçek Rehberi · Tarodan",
    description: "Tarodan ölçek rehberi güncellenmektedir.",
    robots: { index: false },
  };
}

export default function SizeGuidePage() {
  return <DocUnderRevision title="Ölçek Rehberi" />;
}
