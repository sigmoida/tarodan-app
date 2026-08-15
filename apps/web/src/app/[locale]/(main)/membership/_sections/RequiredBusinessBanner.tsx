/** @format */

"use client";

import Notice from "../_components/Notice";
import { useTranslations } from "next-intl";

/**
 * Shown when a company account must buy the business plan before continuing.
 *
 * Sadeleştirildi: 48px'lik renkli daire + ikon, çift kalınlıkta sarı çerçeve ve
 * ikinci bir uyarı ikonu kaldırıldı. Mesaj sayfanın en üstünde ve tek başına
 * duruyor; okunması için ek görsel ağırlığa ihtiyacı yok.
 */
export default function RequiredBusinessBanner() {
  const t = useTranslations();
  return (
    <Notice
      title={t("page.membership.requiredbusinessbanner.businessUyelikGerekli")}
    >
      {t(
        "page.membership.requiredbusinessbanner.sirketHesabinizIcinBusinessUyelikAlmaniz",
      )}
    </Notice>
  );
}
