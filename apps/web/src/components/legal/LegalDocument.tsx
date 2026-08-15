/** @format */

import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

/**
 * Hukuki metinlerin ortak iskeleti.
 *
 * Mesafeli satış sözleşmesi, ön bilgilendirme formu ve KVKK aydınlatma metni
 * aynı biçimde okunmalı: numaralı maddeler, madde içinde paragraf/liste ve
 * sipariş bazında doldurulan alanlar. Her sayfa kendi işaretlemesini yazarsa
 * biri güncellenirken diğerinin görünümü kayıyor — bu yüzden yapı tek yerde,
 * içerik ise sayfaların `_lib` dosyalarında durur.
 *
 * Sunucu bileşenidir (etkileşim yok): metin ilk HTML'de gelir, arama motoru ve
 * yazdırma çıktısı eksiksiz olur.
 */

export type LegalBlock =
  | { type: "p"; text: string }
  /** Düz madde listesi; `label` verilen maddede etiket kalın basılır. */
  | { type: "list"; items: { label?: string; text: string }[] }
  /** Başlıklı alt gruplar (ör. veri kategorilerinin ilgili kişi grubuna göre dökümü). */
  | { type: "groups"; groups: { title: string; items: string[] }[] }
  /** Siparişe/kişiye özel, metinde sabit olmayan alanlar. */
  | {
      type: "fields";
      intro?: string;
      items: { label: string; value?: string }[];
    }
  /** Vurgulanan uyarı/onay cümlesi. */
  | { type: "note"; text: string };

export interface LegalSection {
  /** Madde numarası (ör. "1", "6.1", "2.3"). */
  number: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalPart {
  title: string;
  intro?: string;
  sections: LegalSection[];
}

async function Block({ block }: { block: LegalBlock }) {
  if (block.type === "p") {
    return <p className="text-sm leading-relaxed text-body">{block.text}</p>;
  }

  if (block.type === "note") {
    return (
      <p className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm leading-relaxed text-body">
        {block.text}
      </p>
    );
  }

  if (block.type === "list") {
    return (
      <ul className="space-y-2">
        {block.items.map((item) => (
          <li
            key={`${item.label ?? ""}${item.text}`}
            className="border-l-2 border-border pl-3 text-sm leading-relaxed text-body"
          >
            {item.label && (
              <strong className="font-medium text-heading">
                {item.label}
                {": "}
              </strong>
            )}
            {item.text}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "groups") {
    return (
      <div className="space-y-4">
        {block.groups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-sm font-semibold text-heading">
              {group.title}
            </p>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li
                  key={item}
                  className="border-l-2 border-border pl-3 text-sm leading-relaxed text-body"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const t = await getTranslations();

  return (
    <div>
      {block.intro && (
        <p className="mb-3 text-sm leading-relaxed text-body">{block.intro}</p>
      )}
      <dl className="space-y-1.5">
        {block.items.map((item) => (
          <div key={item.label} className="flex flex-wrap gap-x-2 text-sm">
            <dt className="font-medium text-heading">{item.label}:</dt>
            {/* Değeri olmayan alan siparişe özeldir; metinde boş köşeli parantez
                yerine ne zaman doldurulduğunu söyleyen bir ifade durur. */}
            <dd className={item.value ? "text-body" : "text-muted"}>
              {item.value ?? t("legal.fieldStatedInOrder")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Section({ section }: { section: LegalSection }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold text-heading">
        {section.number}. {section.heading}
      </h3>
      <div className="space-y-3">
        {section.blocks.map((block, index) => (
          <Block key={`${section.number}-${index}`} block={block} />
        ))}
      </div>
    </section>
  );
}

export function LegalDocument({
  title,
  description,
  parts,
  footer,
}: {
  title: string;
  description?: string;
  parts: LegalPart[];
  /** Metnin sonunda gösterilen yürürlük/erişim notu. */
  footer?: string;
}) {
  return (
    <DocPage title={title} description={description}>
      {parts.map((part) => (
        <SectionCard key={part.title} title={part.title}>
          <div className="space-y-7">
            {part.intro && (
              <p className="text-sm leading-relaxed text-body">{part.intro}</p>
            )}
            {part.sections.map((section) => (
              <Section key={section.number} section={section} />
            ))}
          </div>
        </SectionCard>
      ))}
      {footer && (
        <p className="text-xs leading-relaxed text-subtle">{footer}</p>
      )}
    </DocPage>
  );
}
