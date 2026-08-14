import { Link } from "@/i18n/navigation";
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { STEPS, GUARANTEES, FAQ, type Lang } from "../_lib/data";

export default function SecureSwapClient({ lang }: { lang: Lang }) {
  return (
    <DocPage
      title={lang === "en" ? "Secure Trade System" : "Güvenli Takas Sistemi"}
      description={
        lang === "en"
          ? "Trade your collectibles with other collectors safely. Our system protects both parties at every step."
          : "Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Sistemimiz her adımda iki tarafı da korur."
      }
    >
      <SectionCard title={lang === "en" ? "How It Works" : "Nasıl Çalışır?"}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS[lang].map((step, i) => (
            <div
              key={i}
              className="relative rounded border border-border-subtle bg-surface p-5"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-primary-50">
                  <step.icon className="h-5 w-5 text-primary-500" />
                </div>
                <span className="text-xs font-bold uppercase text-subtle">
                  {lang === "en" ? `Step ${i + 1}` : `Adım ${i + 1}`}
                </span>
              </div>
              <h3 className="mb-1.5 font-semibold text-heading">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={lang === "en" ? "Security Guarantees" : "Güvenlik Garantileri"}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GUARANTEES[lang].map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded border border-border-subtle bg-surface p-5"
            >
              <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-500" />
              <div>
                <h3 className="mb-1 font-semibold text-heading">
                  {item.title}
                </h3>
                <p className="text-sm text-muted">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={
          lang === "en" ? "Frequently Asked Questions" : "Sıkça Sorulan Sorular"
        }
      >
        <div className="space-y-4">
          {FAQ[lang].map((item, i) => (
            <div
              key={i}
              className="rounded border border-border-subtle bg-surface p-5"
            >
              <h3 className="mb-2 font-semibold text-heading">{item.q}</h3>
              <p className="text-sm leading-relaxed text-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={
          lang === "en"
            ? "Ready to Start Trading?"
            : "Takasa Başlamaya Hazır mısınız?"
        }
      >
        <p className="mb-8 text-muted">
          {lang === "en"
            ? "Browse listings and send your first trade offer today."
            : "İlanları inceleyin ve ilk takas teklifinizi bugün gönderin."}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/profile/trades"
            className="inline-flex items-center justify-center gap-2 rounded bg-primary-500 px-6 py-3 text-sm font-semibold text-inverted transition-colors hover:bg-primary-600"
          >
            <ArrowsRightLeftIcon className="h-5 w-5" />
            {lang === "en" ? "Start Trading" : "Takasa Başla"}
          </Link>
          <Link
            href="/listings"
            className="inline-flex items-center justify-center gap-2 rounded border border-border bg-surface-elevated px-6 py-3 text-sm font-semibold text-body transition-colors hover:border-border"
          >
            {lang === "en" ? "Browse Listings" : "İlanları İncele"}
          </Link>
        </div>
      </SectionCard>
    </DocPage>
  );
}
