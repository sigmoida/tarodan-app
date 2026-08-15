import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { guideList } from "../_lib/guides";

export default async function GuidesClient() {
  const t = await getTranslations();

  return (
    <DocPage title={t("guides.title")} description={t("guides.subtitle")}>
      {/* Kılavuz listesi — anchor'lar (#selling, #trade …) /support ve FAQ
			    sayfalarından linkleniyor, o yüzden id + scroll-mt korunuyor. */}
      <nav className="flex flex-wrap gap-x-4 gap-y-2">
        {guideList(t).map((guide) => (
          <a
            key={guide.id}
            href={`#${guide.id}`}
            className="text-sm text-muted transition-colors hover:text-primary-600"
          >
            {guide.title}
          </a>
        ))}
      </nav>

      {guideList(t).map((guide) => (
        <div key={guide.id} id={guide.id} className="scroll-mt-24">
          <SectionCard title={guide.title}>
            <ol className="space-y-5">
              {guide.steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="w-5 flex-shrink-0 pt-0.5 text-sm font-medium tabular-nums text-subtle">
                    {index + 1}.
                  </span>
                  <div>
                    <h3 className="font-medium text-heading">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-body">
                      {step.content}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      ))}

      <SectionCard title={t("guides.safetyTips")}>
        <ul className="space-y-2">
          {[
            t(
              "page.guides.guidesclient.odemeleriHerZamanPlatformUzerindenYapin",
            ),
            t("page.guides.guidesclient.supheliFiyatlaraDikkatEdin"),
            t("page.guides.guidesclient.saticiDegerlendirmeleriniKontrolEdin"),
            t("page.guides.guidesclient.kargoTakipNumarasiniMutlakaAlin"),
            t("page.guides.guidesclient.teslimatSirasindaPaketiKontrolEdin"),
            t("page.guides.guidesclient.sorunOlursa24SaatIcindeBildirin"),
          ].map((tip) => (
            <li
              key={tip}
              className="border-l-2 border-border pl-3 text-sm leading-relaxed text-body"
            >
              {tip}
            </li>
          ))}
        </ul>
      </SectionCard>
    </DocPage>
  );
}
