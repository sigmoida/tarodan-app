/** @format */

import { getTranslations } from "next-intl/server";
import { DocPage } from "./DocPage";
import SectionCard from "@/components/ui/SectionCard";

/**
 * İçeriği yeniden yazılmakta olan doküman sayfaları için ortak yer tutucu.
 * Sayfa ve rotası ayakta kalır (linkler kırılmaz, SEO'da 404 üretmez), yalnızca
 * gövde "Güncelleniyor" mesajıyla değişir.
 */
export async function DocUnderRevision({ title }: { title: string }) {
  const t = await getTranslations();
  return (
    <DocPage title={title}>
      <SectionCard>
        <div className="py-12 text-center">
          <p className="text-lg font-medium text-heading">
            {t("utility.underRevision.title")}
          </p>
          <p className="mt-2 text-sm text-muted">
            {t("utility.underRevision.description")}
          </p>
        </div>
      </SectionCard>
    </DocPage>
  );
}
