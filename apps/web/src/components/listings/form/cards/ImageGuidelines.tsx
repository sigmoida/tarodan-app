/** @format */

"use client";

import { useTranslations } from "next-intl";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@tarodan/ui";
import {
  MAX_IMAGE_BYTES,
  MIN_IMAGE_BYTES,
  MIN_RECOMMENDED_DIMENSION,
} from "../listing-image-item";

/**
 * "Görsel kuralları ve ipuçları" — yükleme öncesi 3 kontrol + ürün fotoğrafı
 * gereksinimleri.
 *
 * Katlanır tutulur: yeni satıcı (henüz görsel yokken açık gelir) yönlendirme
 * görsün, düzenlemeye giren satıcı her seferinde aynı metin bloğunu
 * kaydırmak zorunda kalmasın.
 */

/** Yüklemeden önceki sıralı kontroller — numaralar sıradan gelir. */
const CHECKS = [
  {
    title: "product.imageUpload.checkFormatTitle",
    text: "product.imageUpload.checkFormatText",
  },
  {
    title: "product.imageUpload.checkSizeTitle",
    text: "product.imageUpload.checkSizeText",
  },
  {
    title: "product.imageUpload.checkResolutionTitle",
    text: "product.imageUpload.checkResolutionText",
  },
] as const;

/** Fotoğrafın kendisiyle ilgili gereksinimler. */
const RULES = [
  {
    title: "product.imageUpload.ruleClarityTitle",
    text: "product.imageUpload.ruleClarityText",
  },
  {
    title: "product.imageUpload.ruleVariantTitle",
    text: "product.imageUpload.ruleVariantText",
  },
  {
    title: "product.imageUpload.ruleBackgroundTitle",
    text: "product.imageUpload.ruleBackgroundText",
  },
  {
    title: "product.imageUpload.ruleCoverTitle",
    text: "product.imageUpload.ruleCoverText",
  },
] as const;

export interface ImageGuidelinesProps {
  /** Panel açık başlasın mı? (Kart boşken açık, görsel varken kapalı.) */
  defaultOpen?: boolean;
}

export default function ImageGuidelines({
  defaultOpen = false,
}: ImageGuidelinesProps) {
  const t = useTranslations();
  // Sayılar metne gömülmez: sınırlar kodda tek yerde tanımlı, katalog onları
  // ICU parametresi olarak alır.
  const values = {
    max: Math.round(MAX_IMAGE_BYTES / (1024 * 1024)),
    min: Math.round(MIN_IMAGE_BYTES / 1024),
    size: MIN_RECOMMENDED_DIMENSION,
  };

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? "guide" : undefined}
      className="rounded-xl border border-border bg-surface-alt/40"
    >
      <AccordionItem value="guide" className="border-b-0">
        <AccordionTrigger className="rounded-xl px-3 py-2.5 text-xs sm:text-sm">
          <span className="flex items-center gap-2 text-left">
            <InformationCircleIcon className="h-4 w-4 flex-none text-primary-500" />
            {t("product.imageUpload.guideTitle")}
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-0 pt-0">
          <div className="space-y-4">
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {t("product.imageUpload.checksTitle")}
              </p>
              <ol className="grid gap-2 sm:grid-cols-3">
                {CHECKS.map((check, index) => (
                  <li
                    key={check.title}
                    className="flex gap-2 rounded-lg bg-surface p-2.5 ring-1 ring-border"
                  >
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-primary-100 text-[11px] font-bold text-primary-700">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-heading">
                        {t(check.title)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                        {t(check.text, values)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {t("product.imageUpload.rulesTitle")}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {RULES.map((rule) => (
                  <li
                    key={rule.title}
                    className="rounded-lg border-l-2 border-primary-500 bg-surface py-2 pl-2.5 pr-3 ring-1 ring-border"
                  >
                    <span className="block text-xs font-semibold text-heading">
                      {t(rule.title)}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                      {t(rule.text)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
