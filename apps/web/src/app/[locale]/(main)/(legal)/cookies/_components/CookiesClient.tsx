import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import type { Translate } from "@/types/i18n";
import CookiePreferencesPanel from "./CookiePreferencesPanel";

/** Saklama süreleri — 5651, KVKK, ETK, VUK ve TTK hükümlerinden. */
const retentionRows = (t: Translate) => [
  {
    type: t("legal.cookies.page.retentionTrafficType"),
    data: t("legal.cookies.page.retentionTrafficData"),
    basis: t("legal.cookies.page.retentionTrafficBasis"),
    period: t("legal.cookies.page.retentionTrafficPeriod"),
  },
  {
    type: t("legal.cookies.page.retentionFinanceType"),
    data: t("legal.cookies.page.retentionFinanceData"),
    basis: t("legal.cookies.page.retentionFinanceBasis"),
    period: t("legal.cookies.page.retentionFinancePeriod"),
  },
  {
    type: t("legal.cookies.page.retentionEtkType"),
    data: t("legal.cookies.page.retentionEtkData"),
    basis: t("legal.cookies.page.retentionEtkBasis"),
    period: t("legal.cookies.page.retentionEtkPeriod"),
  },
  {
    type: t("legal.cookies.page.retentionMembershipType"),
    data: t("legal.cookies.page.retentionMembershipData"),
    basis: t("legal.cookies.page.retentionMembershipBasis"),
    period: t("legal.cookies.page.retentionMembershipPeriod"),
  },
  {
    type: t("legal.cookies.page.retentionConsentType"),
    data: t("legal.cookies.page.retentionConsentData"),
    basis: t("legal.cookies.page.retentionConsentBasis"),
    period: t("legal.cookies.page.retentionConsentPeriod"),
  },
];

/** Bireysel (C2C) ve kurumsal kullanıcılar için yasal kapsam farkları. */
const userScopeRows = (t: Translate) => [
  {
    criterion: t("legal.cookies.page.scopeKvkkCriterion"),
    individual: t("legal.cookies.page.scopeKvkkIndividual"),
    corporate: t("legal.cookies.page.scopeKvkkCorporate"),
  },
  {
    criterion: t("legal.cookies.page.scopeConsentCriterion"),
    individual: t("legal.cookies.page.scopeConsentIndividual"),
    corporate: t("legal.cookies.page.scopeConsentCorporate"),
  },
  {
    criterion: t("legal.cookies.page.scopeEtkCriterion"),
    individual: t("legal.cookies.page.scopeEtkIndividual"),
    corporate: t("legal.cookies.page.scopeEtkCorporate"),
  },
  {
    criterion: t("legal.cookies.page.scopeContractCriterion"),
    individual: t("legal.cookies.page.scopeContractIndividual"),
    corporate: t("legal.cookies.page.scopeContractCorporate"),
  },
];

/** Sağlayıcı ADLARI markadır ve çevrilmez; yalnız kullanım amacı katalogdadır. */
const thirdParties = (t: Translate) => [
  {
    name: "Google (Analytics, Tag Manager, Ads, YouTube)",
    purpose: t("legal.cookies.page.thirdPartyGooglePurpose"),
    href: "https://policies.google.com/privacy",
  },
  {
    name: "Yandex (Metrica, Direct)",
    purpose: t("legal.cookies.page.thirdPartyYandexPurpose"),
    href: "https://yandex.com/legal/confidential/",
  },
  {
    name: "Meta (Facebook / Instagram)",
    purpose: t("legal.cookies.page.thirdPartyMetaPurpose"),
    href: "https://www.facebook.com/privacy/policy",
  },
  {
    name: "TikTok",
    purpose: t("legal.cookies.page.thirdPartyTiktokPurpose"),
    href: "https://www.tiktok.com/legal/privacy-policy",
  },
  {
    name: "PayTR",
    purpose: t("legal.cookies.page.thirdPartyPaytrPurpose"),
    href: "https://www.paytr.com/kvkk",
  },
];

/** Tarayıcı adları markadır; yalnız bağlantı hedefleri değişebilir. */
const BROWSER_GUIDES = [
  {
    name: "Google Chrome",
    href: "https://support.google.com/chrome/answer/95647",
  },
  {
    name: "Mozilla Firefox",
    href: "https://support.mozilla.org/tr/kb/cerezleri-etkinlestirme-ve-devre-disi-birakma",
  },
  {
    name: "Apple Safari",
    href: "https://support.apple.com/tr-tr/guide/safari/sfri11471/mac",
  },
  {
    name: "Microsoft Edge",
    href: "https://support.microsoft.com/tr-tr/microsoft-edge",
  },
];

const SUPPORT_EMAIL = "destek@tarodan.com.tr";
const SUPPORT_PHONE = "0850 XXX XX XX";

export default async function CookiesClient() {
  const t = await getTranslations();

  return (
    <DocPage
      title={t("legal.cookiesTitle")}
      description={`${t("legal.lastUpdated")}: ${t("legal.cookies.page.lastUpdatedValue")}`}
    >
      <SectionCard title={t("legal.cookies.page.s1Title")}>
        <div className="prose prose-gray max-w-none">
          <p>{t("legal.cookies.page.s1p1")}</p>
          <p>
            {t.rich("legal.cookies.page.s1p2", {
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p>{t("legal.cookies.page.s1p3")}</p>
        </div>
      </SectionCard>

      <SectionCard title={t("legal.cookies.page.s2Title")}>
        <CookiePreferencesPanel
          saveLabel={t("legal.savePreferences")}
          acceptAllLabel={t("legal.acceptAll")}
        />
      </SectionCard>

      <SectionCard title={t("legal.cookies.page.s3Title")}>
        <p className="mb-4 text-sm text-muted">
          {t("legal.cookies.page.s3Intro")}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colProvider")}
                </th>
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colUsage")}
                </th>
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colPolicy")}
                </th>
              </tr>
            </thead>
            <tbody className="text-body">
              {thirdParties(t).map((party) => (
                <tr key={party.name} className="border-t border-border-subtle">
                  <td className="py-2 pr-4 font-medium">{party.name}</td>
                  <td className="py-2 pr-4">{party.purpose}</td>
                  <td className="py-2">
                    <a
                      href={party.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
                      {t("legal.cookies.page.view")}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title={t("legal.cookies.page.s4Title")}>
        <p className="mb-4 text-sm text-muted">
          {t("legal.cookies.page.s4Intro")}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colCriterion")}
                </th>
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colIndividual")}
                </th>
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colCorporate")}
                </th>
              </tr>
            </thead>
            <tbody className="text-body">
              {userScopeRows(t).map((row) => (
                <tr
                  key={row.criterion}
                  className="border-t border-border-subtle"
                >
                  <td className="py-2 pr-4 align-top font-medium">
                    {row.criterion}
                  </td>
                  <td className="py-2 pr-4 align-top">{row.individual}</td>
                  <td className="py-2 align-top">{row.corporate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title={t("legal.cookies.page.s5Title")}>
        <p className="mb-4 text-sm text-muted">
          {t("legal.cookies.page.s5Intro")}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colLogType")}
                </th>
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colStoredData")}
                </th>
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colLegalBasis")}
                </th>
                <th className="pb-2 font-medium">
                  {t("legal.cookies.page.colRetention")}
                </th>
              </tr>
            </thead>
            <tbody className="text-body">
              {retentionRows(t).map((row) => (
                <tr key={row.type} className="border-t border-border-subtle">
                  <td className="py-2 pr-4 align-top font-medium">
                    {row.type}
                  </td>
                  <td className="py-2 pr-4 align-top">{row.data}</td>
                  <td className="py-2 pr-4 align-top">{row.basis}</td>
                  <td className="whitespace-nowrap py-2 align-top">
                    {row.period}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          {t("legal.cookies.page.s5Note")}
        </p>
      </SectionCard>

      <SectionCard title={t("legal.cookies.page.s6Title")}>
        <div className="prose prose-gray max-w-none">
          <p>{t("legal.cookies.page.s6p1")}</p>
          <ul>
            {BROWSER_GUIDES.map((guide) => (
              <li key={guide.name}>
                <a href={guide.href} target="_blank" rel="noopener noreferrer">
                  {guide.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          {t.rich("legal.cookies.page.s6Warning", {
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </SectionCard>

      <SectionCard title={t("legal.cookies.page.s7Title")}>
        <div className="prose prose-gray max-w-none">
          <p>{t("legal.cookies.page.s7p1")}</p>
          <ul>
            <li>
              <strong>{t("legal.cookies.page.contactEmailLabel")}</strong>{" "}
              {SUPPORT_EMAIL}
            </li>
            <li>
              <strong>{t("legal.cookies.page.contactPhoneLabel")}</strong>{" "}
              {SUPPORT_PHONE}
            </li>
          </ul>
        </div>
      </SectionCard>
    </DocPage>
  );
}
