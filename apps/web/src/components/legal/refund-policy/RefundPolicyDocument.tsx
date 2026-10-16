/** @format */

import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import {
  returnPolicy,
  cancellationPolicy,
  type PolicyEntry,
} from "../_lib/policy";

/** Tek bir soru-cevap bloğu: başlık, açıklama, madde listesi. */
function PolicyBlock({ entry }: { entry: PolicyEntry }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold text-heading">{entry.q}</h3>
      {entry.a && (
        <p className="text-sm leading-relaxed text-body">{entry.a}</p>
      )}
      {entry.bullets && (
        <ul className="mt-3 space-y-2">
          {entry.bullets.map((bullet) => (
            <li
              key={`${bullet.label ?? ""}${bullet.text}`}
              className="border-l-2 border-border pl-3 text-sm leading-relaxed text-body"
            >
              {bullet.label && (
                <strong className="font-medium text-heading">
                  {bullet.label}
                  {": "}
                </strong>
              )}
              {bullet.text}
            </li>
          ))}
        </ul>
      )}
      {entry.note && (
        <p className="mt-3 text-sm leading-relaxed text-body">{entry.note}</p>
      )}
    </section>
  );
}

export default async function RefundPolicyClient() {
  const t = await getTranslations();
  return (
    <DocPage
      title={t("legal.refundPolicyTitle")}
      description={t("legal.refundPolicy.pageDescription")}
    >
      <SectionCard title={t("legal.refundPolicy.returnSection")}>
        <div className="space-y-7">
          {returnPolicy(t).map((entry) => (
            <PolicyBlock key={entry.q} entry={entry} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("legal.refundPolicy.cancellationSection")}>
        <div className="space-y-7">
          {cancellationPolicy(t).map((entry) => (
            <PolicyBlock key={entry.q} entry={entry} />
          ))}
        </div>
      </SectionCard>
    </DocPage>
  );
}
