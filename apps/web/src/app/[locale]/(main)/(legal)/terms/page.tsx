import type { Metadata } from "next";
import { DocUnderRevision } from "@/components/layout/DocUnderRevision";

/**
 * İçerik yenilenene kadar sayfa "Güncelleniyor" yer tutucusunu gösterir.
 * Metin normalde CMS'ten geliyordu (`_lib/data.ts` → `/api/pages/terms`);
 * o fetch geri bağlandığında burası eski haline döner.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Kullanım Koşulları · Tarodan",
    description: "Tarodan kullanım koşulları güncellenmektedir.",
    robots: { index: false },
  };
}

export default function TermsPage() {
  return <DocUnderRevision title="Kullanım Koşulları" />;
}
