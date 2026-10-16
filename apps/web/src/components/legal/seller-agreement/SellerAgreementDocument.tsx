/** @format */

import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import type { Translate } from "@/types/i18n";
import SectionCard from "@/components/ui/SectionCard";
import {
  feeTable,
  individualIntro,
  individualAgreement,
  corporateIntro,
  corporateAgreement,
  type AgreementSection,
} from "../_lib/agreement";

function FeeTable({ t }: { t: Translate }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="pb-2 pr-4 font-medium">
              {t("legal.sellerAgreement.feeAmount")}
            </th>
            <th className="pb-2 pr-4 font-medium">
              {t("legal.sellerAgreement.feeSellerCommission")}
            </th>
            <th className="pb-2 pr-4 font-medium">
              {t("legal.sellerAgreement.feeBuyerCommission")}
            </th>
            <th className="pb-2 pr-4 font-medium">
              {t("legal.sellerAgreement.feeSellerShipping")}
            </th>
            <th className="pb-2 pr-4 font-medium">
              {t("legal.sellerAgreement.feeBuyerShipping")}
            </th>
            <th className="pb-2 pr-4 font-medium">
              {t("legal.sellerAgreement.feeSellerPlatformFee")}
            </th>
            <th className="pb-2 font-medium">
              {t("legal.sellerAgreement.feeBuyerProtection")}
            </th>
          </tr>
        </thead>
        <tbody className="text-body">
          {feeTable(t).map((row) => (
            <tr key={row.range} className="border-t border-border-subtle">
              <td className="py-2 pr-4 font-medium">{row.range}</td>
              <td className="py-2 pr-4 tabular-nums">{row.sellerCommission}</td>
              <td className="py-2 pr-4 tabular-nums">{row.buyerCommission}</td>
              <td className="py-2 pr-4 tabular-nums">{row.sellerShipping}</td>
              <td className="py-2 pr-4 tabular-nums">{row.buyerShipping}</td>
              <td className="py-2 pr-4 tabular-nums">{row.sellerServiceFee}</td>
              <td className="py-2 tabular-nums">{row.buyerProtectionFee}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ section, t }: { section: AgreementSection; t: Translate }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold text-heading">{section.title}</h3>
      {section.intro && (
        <p className="text-sm leading-relaxed text-body">{section.intro}</p>
      )}
      {section.clauses && (
        <ul className="mt-3 space-y-2">
          {section.clauses.map((clause) => (
            <li
              key={`${clause.label ?? ""}${clause.text}`}
              className="border-l-2 border-border pl-3 text-sm leading-relaxed text-body"
            >
              {clause.label && (
                <strong className="font-medium text-heading">
                  {clause.label}
                  {": "}
                </strong>
              )}
              {clause.text}
            </li>
          ))}
        </ul>
      )}
      {section.showFeeTable && <FeeTable t={t} />}
    </section>
  );
}

export default async function SellerAgreementClient() {
  const t = await getTranslations();
  return (
    <DocPage
      title={t("legal.sellerAgreement.pageTitle")}
      description={t("legal.sellerAgreement.pageDescription")}
    >
      <SectionCard title={t("legal.sellerAgreement.individualSection")}>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {individualIntro(t)}
        </p>
        <div className="space-y-7">
          {individualAgreement(t).map((section) => (
            <Section key={section.title} section={section} t={t} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("legal.sellerAgreement.corporateSection")}>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {corporateIntro(t)}
        </p>
        <div className="space-y-7">
          {corporateAgreement(t).map((section) => (
            <Section key={section.title} section={section} t={t} />
          ))}
        </div>
      </SectionCard>
    </DocPage>
  );
}
