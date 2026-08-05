/** @format */

import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import {
  RETURN_POLICY,
  CANCELLATION_POLICY,
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

export default function RefundPolicyClient() {
  return (
    <DocPage
      title="İade Politikası"
      description="İade ve iptal taleplerinin hangi koşullarda oluşturulduğu, nasıl değerlendirildiği ve ücret iadesinin nasıl işlediği."
    >
      <SectionCard title="İade Koşul ve Şartları">
        <div className="space-y-7">
          {RETURN_POLICY.map((entry) => (
            <PolicyBlock key={entry.q} entry={entry} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="İptal Koşul ve Şartları">
        <div className="space-y-7">
          {CANCELLATION_POLICY.map((entry) => (
            <PolicyBlock key={entry.q} entry={entry} />
          ))}
        </div>
      </SectionCard>
    </DocPage>
  );
}
