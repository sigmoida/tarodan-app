/** @format */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { EmbedDoc } from "@/lib/embed";
import type { Translate } from "@/types/i18n";

/**
 * Yasal belgelerin TEK kaydı: hem normal site sayfaları (`(main)/(legal)/*`) hem
 * mobil WebView sayfaları (`(embed)/app/[doc]`) içeriği ve meta metnini buradan
 * alır — iki yüzey birbirinden kayamaz. Yeni bir embed belgesi `EmbedDoc`a
 * eklenince burada karşılığı yazılmadan derleme geçmez (`Record`).
 *
 * İçerik modülleri `load` içinde tembel import edilir: bir sayfa yalnız kendi
 * belgesinin modül grafiğini çeker, diğer 5 belgeninkini değil.
 */
type LegalDocComponent = (props: {
  embed?: boolean;
}) => ReactNode | Promise<ReactNode>;

interface LegalDocDef {
  meta: (t: Translate) => { title: string; description: string };
  /** Belge bileşeni (sunucu). `embed`: mobil WebView kipi. */
  load: () => Promise<{ default: LegalDocComponent }>;
}

export const LEGAL_DOCS: Record<EmbedDoc, LegalDocDef> = {
  terms: {
    meta: (t) => ({
      title: t("legal.terms.metaTitle"),
      description: t("legal.terms.metaDescription"),
    }),
    load: () => import("./terms/TermsDocument"),
  },
  privacy: {
    meta: (t) => ({
      title: t("legal.privacy.metaTitle"),
      description: t("legal.privacy.metaDescription"),
    }),
    load: () => import("./privacy/PrivacyDocument"),
  },
  "distance-sales": {
    meta: (t) => ({
      title: t("legal.distanceSales.metaTitle"),
      description: t("legal.distanceSales.metaDescription"),
    }),
    load: () => import("./distance-sales/DistanceSalesDocument"),
  },
  cookies: {
    meta: (t) => ({
      title: t("page.cookies.page.cerezPolitikasiTarodan"),
      description: t(
        "page.cookies.page.tarodanCerezPolitikasiHangiCerezleriNeden",
      ),
    }),
    load: () => import("./cookies/CookiesDocument"),
  },
  "seller-agreement": {
    meta: (t) => ({
      title: t("page.sellerAgreement.page.saticiSozlesmeleriTarodan"),
      description: t(
        "page.sellerAgreement.page.tarodanBireyselVeKurumsalSaticiUyelik",
      ),
    }),
    load: () => import("./seller-agreement/SellerAgreementDocument"),
  },
  "refund-policy": {
    meta: (t) => ({
      title: t("page.refundPolicy.page.iadePolitikasiTarodan"),
      description: t("page.refundPolicy.page.tarodanIadeVeIptalKosullariTalep"),
    }),
    load: () => import("./refund-policy/RefundPolicyDocument"),
  },
};

/** Sayfanın `<title>` / `<meta description>` metni (locale'e göre). */
export async function legalDocMeta(doc: EmbedDoc, locale: string) {
  const t = await getTranslations({ locale });
  return LEGAL_DOCS[doc].meta(t);
}

/** Belgenin gövdesi — site sayfası da embed sayfası da bunu çizer. */
export async function LegalDocContent({
  doc,
  embed = false,
}: {
  doc: EmbedDoc;
  /** Mobil WebView kipi (`/app/<doc>`): web'den farklı yalnız ek/panel kuralları. */
  embed?: boolean;
}) {
  const { default: Document } = await LEGAL_DOCS[doc].load();
  // Async sunucu bileşeni: doğrudan çağrılıp await'lenir (`ComponentType` async
  // dönüşü kabul etmez).
  return <>{await Document({ embed })}</>;
}
