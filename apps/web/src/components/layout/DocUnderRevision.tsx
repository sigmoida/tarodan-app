/** @format */

import { DocPage } from "./DocPage";
import SectionCard from "@/components/ui/SectionCard";

/**
 * İçeriği yeniden yazılmakta olan doküman sayfaları için ortak yer tutucu.
 * Sayfa ve rotası ayakta kalır (linkler kırılmaz, SEO'da 404 üretmez), yalnızca
 * gövde "Güncelleniyor" mesajıyla değişir.
 */
export function DocUnderRevision({ title }: { title: string }) {
  return (
    <DocPage title={title}>
      <SectionCard>
        <div className="py-12 text-center">
          <p className="text-lg font-medium text-heading">Güncelleniyor</p>
          <p className="mt-2 text-sm text-muted">
            Bu sayfanın içeriği yenilenmektedir. Kısa süre içinde tekrar yayında
            olacaktır.
          </p>
        </div>
      </SectionCard>
    </DocPage>
  );
}
