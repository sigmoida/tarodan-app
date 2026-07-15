/** @format */

import type { Metadata } from "next";
import SizeGuideClient from "./_components/SizeGuideClient";

export const metadata: Metadata = {
  title: "Ölçek Rehberi · Tarodan",
  description:
    "Model araba ölçekleri kılavuzu: 1:18, 1:24, 1:43 ve 1:64 ölçeklerinin yaklaşık boyutları ve notları.",
  alternates: { canonical: "/size-guide" },
};

export default function SizeGuidePage() {
  return <SizeGuideClient />;
}
