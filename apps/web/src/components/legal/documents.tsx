/** @format */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import type { EmbedDoc } from "@/lib/embed";
import type { Translate } from "@/types/i18n";
import CookiesClient from "@/app/[locale]/(main)/(legal)/cookies/_components/CookiesClient";
import { distanceSalesParts } from "@/app/[locale]/(main)/(legal)/distance-sales/_lib/contract";
import { privacyParts } from "@/app/[locale]/(main)/(legal)/privacy/_lib/privacy";
import RefundPolicyClient from "@/app/[locale]/(main)/(legal)/refund-policy/_components/RefundPolicyClient";
import SellerAgreementClient from "@/app/[locale]/(main)/(legal)/seller-agreement/_components/SellerAgreementClient";
import {
  termsParts,
  termsUgcAddendum,
} from "@/app/[locale]/(main)/(legal)/terms/_lib/terms";

/**
 * Yasal belgelerin TEK kaydı: hem normal site sayfaları (`(main)/(legal)/*`) hem
 * mobil WebView sayfaları (`(embed)/app/[doc]`) içeriği ve meta metnini buradan
 * alır — iki yüzey birbirinden kayamaz. Yeni bir embed belgesi `EmbedDoc`a
 * eklenince burada karşılığı yazılmadan derleme geçmez (`Record`).
 */
interface LegalDocDef {
  meta: (t: Translate) => { title: string; description: string };
  render: (t: Translate) => ReactNode;
}

export const LEGAL_DOCS: Record<EmbedDoc, LegalDocDef> = {
  terms: {
    meta: (t) => ({
      title: t("legal.terms.metaTitle"),
      description: t("legal.terms.metaDescription"),
    }),
    render: (t) => (
      <LegalDocument
        title={t("legal.termsTitle")}
        description={t("legal.terms.pageDescription")}
        parts={[...termsParts(t), termsUgcAddendum(t)]}
        footer={t("legal.terms.pageFooter")}
      />
    ),
  },
  privacy: {
    meta: (t) => ({
      title: t("legal.privacy.metaTitle"),
      description: t("legal.privacy.metaDescription"),
    }),
    render: (t) => (
      <LegalDocument
        title={t("legal.privacyTitle")}
        description={t("legal.privacy.pageDescription")}
        parts={privacyParts(t)}
        footer={t("legal.privacy.pageFooter")}
      />
    ),
  },
  "distance-sales": {
    meta: (t) => ({
      title: t("legal.distanceSales.metaTitle"),
      description: t("legal.distanceSales.metaDescription"),
    }),
    render: (t) => (
      <LegalDocument
        title={t("legal.distanceSalesTitle")}
        description={t("legal.distanceSales.pageDescription")}
        parts={distanceSalesParts(t)}
        footer={t("legal.distanceSales.pageFooter")}
      />
    ),
  },
  cookies: {
    meta: (t) => ({
      title: t("page.cookies.page.cerezPolitikasiTarodan"),
      description: t(
        "page.cookies.page.tarodanCerezPolitikasiHangiCerezleriNeden",
      ),
    }),
    render: () => <CookiesClient />,
  },
  "seller-agreement": {
    meta: (t) => ({
      title: t("page.sellerAgreement.page.saticiSozlesmeleriTarodan"),
      description: t(
        "page.sellerAgreement.page.tarodanBireyselVeKurumsalSaticiUyelik",
      ),
    }),
    render: () => <SellerAgreementClient />,
  },
  "refund-policy": {
    meta: (t) => ({
      title: t("page.refundPolicy.page.iadePolitikasiTarodan"),
      description: t("page.refundPolicy.page.tarodanIadeVeIptalKosullariTalep"),
    }),
    render: () => <RefundPolicyClient />,
  },
};

/** Sayfanın `<title>` / `<meta description>` metni (locale'e göre). */
export async function legalDocMeta(doc: EmbedDoc, locale: string) {
  const t = await getTranslations({ locale });
  return LEGAL_DOCS[doc].meta(t);
}

/** Belgenin gövdesi — site sayfası da embed sayfası da bunu çizer. */
export async function LegalDocContent({ doc }: { doc: EmbedDoc }) {
  const t = await getTranslations();
  return <>{LEGAL_DOCS[doc].render(t)}</>;
}
