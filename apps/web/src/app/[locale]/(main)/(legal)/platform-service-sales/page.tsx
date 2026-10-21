/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CONSENT_DOCUMENTS } from "@tarodan/types";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import {
  PLATFORM_ENTITY,
  PLATFORM_ENTITY_FIELDS,
} from "@/lib/legal/platform-entity";
import { localizedCanonical } from "@/lib/seo";

/**
 * The route folder IS the consent document's path (`page.test.tsx` pins the
 * two together), so the boost dialog's links and the consent gate exemption
 * both point here.
 */
const PATH = CONSENT_DOCUMENTS.platform_service_sales.path as string;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("legal.platformServiceSales.title"),
    alternates: localizedCanonical(locale, PATH),
  };
}

/**
 * Pre-contract information and distance service contract for the platform's
 * own services (listing boost today), accepted per order in the boost dialog
 * (`platform_service_sales`, docs/CONSENTS.md).
 *
 * DRAFT and a release blocker: legal has not provided the text yet
 * (tarodan-ops plan 2026-10-21-listing-boost, D15). Until it arrives the page
 * shows only what the plan's draft copy and the platform's legal identity
 * already say; nothing here is invented legal wording. When the signed text
 * lands it replaces this body and the document version loses `-draft`.
 */
export default async function PlatformServiceSalesPage() {
  const t = await getTranslations();
  return (
    <DocPage title={t("legal.platformServiceSales.title")}>
      <SectionCard title={t("profile.boost.preInfo.title")}>
        <div className="space-y-4 text-sm leading-relaxed text-body">
          <div>
            <p className="mb-3">
              {t("profile.boost.preInfo.provider", {
                company: PLATFORM_ENTITY.legalName,
              })}
            </p>
            <dl className="space-y-1.5">
              {PLATFORM_ENTITY_FIELDS(t).map((field) => (
                <div key={field.label} className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-heading">{field.label}:</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ul className="space-y-2">
            <li className="border-l-2 border-border pl-3">
              {t("profile.boost.preInfo.start")}
            </li>
            <li className="border-l-2 border-border pl-3">
              {t("profile.boost.preInfo.noCancel")}
            </li>
          </ul>
        </div>
      </SectionCard>
    </DocPage>
  );
}
