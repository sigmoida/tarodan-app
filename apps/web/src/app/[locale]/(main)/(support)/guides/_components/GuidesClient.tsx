import {
  CheckCircleIcon,
  ShieldCheckIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DocPage } from "@/components/layout/DocPage";
import { GUIDES } from "../_lib/guides";

const GUIDE_TIPS: Record<string, string> = {
  selling:
    "Detaylı açıklamalar ve kaliteli fotoğraflar, ürünlerinizin daha hızlı satılmasını sağlar. Hafta sonları yayınlanan ilanlar daha fazla görüntülenir.",
  buying:
    "Satıcı profilini ve değerlendirmelerini mutlaka kontrol edin. Sorularınız varsa satın almadan önce mesaj atın.",
  trade:
    "Takas tekliflerinde değer dengesine dikkat edin. Fark varsa açıkça belirtin.",
  photography:
    "Telefon kamerası yeterli! Önemli olan ışık ve arka plan. Düzenleme yaparken aşırıya kaçmayın.",
  shipping:
    "Kargo sigortası yaptırmayı unutmayın. Özellikle değerli parçalar için mutlaka sigorta alın.",
  "getting-started":
    "Premium üyelik ile daha fazla ilan verebilir, daha düşük komisyon ödeyebilirsiniz.",
};

export default async function GuidesClient() {
  const t = await getTranslations();

  return (
    <DocPage title={t("guides.title")} description={t("guides.subtitle")}>
      <div id="guide-content" className="scroll-mt-20 space-y-4">
        {GUIDES.map((guide, guideIndex) => (
          <details
            key={guide.id}
            id={guide.id}
            open={guideIndex === 0}
            className="group overflow-hidden rounded-2xl bg-surface-elevated shadow-sm"
          >
            <summary
              className={`${guide.bgColor} flex cursor-pointer list-none items-center gap-4 p-6 marker:hidden`}
            >
              <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-surface-elevated shadow-sm">
                <guide.icon className={`h-7 w-7 ${guide.color}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-bold text-heading">
                  {guide.title}
                </span>
                <span className="block text-sm text-muted">
                  {guide.description}
                </span>
              </span>
              <span className="text-2xl text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>

            <div className="p-8">
              <div className="space-y-6">
                {guide.steps.map((step, index) => (
                  <div key={step.title} className="flex gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 font-bold text-inverted">
                      {index + 1}
                    </div>
                    <div className="flex-1 pt-1">
                      <h3 className="mb-2 font-semibold text-heading">
                        {step.title}
                      </h3>
                      <p className="text-muted">{step.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-xl border border-warning-200 bg-warning-50 p-6">
                <div className="flex items-start gap-3">
                  <StarIcon className="h-6 w-6 flex-shrink-0 text-warning-500" />
                  <div>
                    <h4 className="mb-2 font-semibold text-warning-800">
                      {t("guides.proTip")}
                    </h4>
                    <p className="text-sm text-warning-700">
                      {GUIDE_TIPS[guide.id]}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </details>
        ))}

        <div className="mt-12 rounded-2xl bg-gradient-to-r from-success-500 to-success-600 p-8 text-inverted">
          <div className="flex items-start gap-4">
            <ShieldCheckIcon className="h-12 w-12 flex-shrink-0" />
            <div>
              <h3 className="mb-4 text-2xl font-bold">
                {t("guides.safetyTips")}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  "Ödemeleri her zaman platform üzerinden yapın",
                  "Şüpheli fiyatlara dikkat edin",
                  "Satıcı değerlendirmelerini kontrol edin",
                  "Kargo takip numarasını mutlaka alın",
                  "Teslimat sırasında paketi kontrol edin",
                  "Sorun olursa 24 saat içinde bildirin",
                ].map((tip) => (
                  <div key={tip} className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-success-200" />
                    <span className="text-success-50">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="mb-4 text-muted">{t("guides.stillHaveQuestions")}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/faq"
              className="rounded-xl bg-surface-alt px-6 py-3 font-semibold text-body transition-colors hover:bg-border-subtle"
            >
              {t("guides.faqLink")}
            </Link>
            <Link
              href="/contact"
              className="rounded-xl bg-primary-500 px-6 py-3 font-semibold text-inverted transition-colors hover:bg-primary-600"
            >
              {t("guides.contactLink")}
            </Link>
          </div>
        </div>
      </div>
    </DocPage>
  );
}
