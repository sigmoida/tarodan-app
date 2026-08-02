import type { Metadata } from "next";
import { DocUnderRevision } from "@/components/layout/DocUnderRevision";

/**
 * İçerik yenilenene kadar sayfa "Güncelleniyor" yer tutucusunu gösterir.
 * Metin normalde CMS'ten geliyordu (`_lib/data.ts` → `/api/pages/privacy`);
 * o fetch geri bağlandığında burası eski haline döner.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Gizlilik Politikası · Tarodan",
    description: "Tarodan gizlilik politikası güncellenmektedir.",
    robots: { index: false },
  };
}

export default function PrivacyPage() {
  return <DocUnderRevision title="Gizlilik Politikası" />;
}
