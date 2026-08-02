/** @format */

import type { Metadata } from "next";
import { DocUnderRevision } from "@/components/layout/DocUnderRevision";

/** İçerik yenilenene kadar "Güncelleniyor" yer tutucusu gösterilir. */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Mesafeli Satış Sözleşmesi · Tarodan",
    description: "Tarodan mesafeli satış sözleşmesi güncellenmektedir.",
    robots: { index: false },
  };
}

export default function DistanceSalesPage() {
  return <DocUnderRevision title="Mesafeli Satış Sözleşmesi" />;
}
