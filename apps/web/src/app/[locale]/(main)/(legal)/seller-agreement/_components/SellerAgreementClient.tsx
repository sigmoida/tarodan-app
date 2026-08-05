/** @format */

import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import {
  FEE_TABLE,
  INDIVIDUAL_INTRO,
  INDIVIDUAL_AGREEMENT,
  CORPORATE_INTRO,
  CORPORATE_AGREEMENT,
  type AgreementSection,
} from "../_lib/agreement";

function FeeTable() {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="pb-2 pr-4 font-medium">Tutar</th>
            <th className="pb-2 pr-4 font-medium">Komisyon</th>
            <th className="pb-2 pr-4 font-medium">
              Satıcı Platform Hizmet Bedeli
            </th>
            <th className="pb-2 font-medium">Kargo</th>
          </tr>
        </thead>
        <tbody className="text-body">
          {FEE_TABLE.map((row) => (
            <tr key={row.range} className="border-t border-border-subtle">
              <td className="py-2 pr-4 font-medium">{row.range}</td>
              <td className="py-2 pr-4 tabular-nums">{row.commission}</td>
              <td className="py-2 pr-4 tabular-nums">{row.serviceFee}</td>
              <td className="py-2 tabular-nums">{row.shipping}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ section }: { section: AgreementSection }) {
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
      {section.showFeeTable && <FeeTable />}
    </section>
  );
}

export default function SellerAgreementClient() {
  return (
    <DocPage
      title="Satıcı Sözleşmeleri"
      description="Tarodan platformunda satış yapan bireysel ve kurumsal satıcılar için geçerli üyelik ve satış sözleşmeleri."
    >
      <SectionCard title="Bireysel Satıcı Üyelik ve Satış Sözleşmesi">
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {INDIVIDUAL_INTRO}
        </p>
        <div className="space-y-7">
          {INDIVIDUAL_AGREEMENT.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Kurumsal Satıcı Üyelik ve Satış Sözleşmesi">
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {CORPORATE_INTRO}
        </p>
        <div className="space-y-7">
          {CORPORATE_AGREEMENT.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>
      </SectionCard>
    </DocPage>
  );
}
