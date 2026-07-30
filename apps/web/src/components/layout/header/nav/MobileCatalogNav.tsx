/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@tarodan/ui";
import { SCALE_FALLBACK } from "@/lib/constants";
import { useNavCatalog } from "../_hooks/useNavCatalog";
import { CATEGORY_BAR_ITEMS, groupManufacturers, navHref } from "./config";

const ROW_CLASS =
  "flex items-center px-4 py-3 text-sm font-medium text-body transition-colors hover:bg-surface-alt hover:text-heading";
const SUB_ROW_CLASS =
  "block px-4 py-2 text-sm text-muted transition-colors hover:text-primary-600";

/**
 * Kategori barının küçük ekran karşılığı: aynı öğeler, yatay bar yerine dikey
 * liste. Masaüstündeki mega-panellerin (kategoriler, ölçek) içeriği burada
 * akordiyon bölümlerine iner — çekmecede iki kademeli açılır menü hem dokunmatik
 * hem dar ekran için uygun değil.
 *
 * Öğe listesi ve adresler masaüstüyle ORTAK (`config.ts`); burada yalnız sunum
 * farklı.
 */
export default function MobileCatalogNav({
  onNavigate,
}: {
  /** Bir bağlantıya gidildiğinde çekmeceyi kapatır. */
  onNavigate: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const { categories, manufacturers, scales } = useNavCatalog();

  const items = CATEGORY_BAR_ITEMS[locale as "tr" | "en"];
  const scaleItems = scales.length > 0 ? scales : SCALE_FALLBACK;
  const manufacturerGroups = groupManufacturers(manufacturers);

  return (
    <nav className="flex flex-col py-1">
      {items.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={ROW_CLASS}
          >
            {item.label}
          </Link>
        ) : null,
      )}

      <Accordion type="multiple" className="border-t border-border-subtle">
        {items.some((item) => item.dropdown === "categories") && (
          <AccordionItem value="categories">
            <AccordionTrigger>
              {items.find((item) => item.dropdown === "categories")?.label}
            </AccordionTrigger>
            <AccordionContent>
              <p className="px-4 pb-1 pt-2 text-2xs font-semibold uppercase tracking-widest text-subtle">
                {t("nav.vehicleTypes")}
              </p>
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={navHref.vehicleType(category.slug)}
                  onClick={onNavigate}
                  className={SUB_ROW_CLASS}
                >
                  {category.name}
                </Link>
              ))}

              <p className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-widest text-subtle">
                {t("nav.manufacturers")}
              </p>
              {manufacturerGroups.map((group) =>
                group.items.map((manufacturer) => (
                  <Link
                    key={manufacturer.id}
                    href={navHref.manufacturer(manufacturer)}
                    onClick={onNavigate}
                    className={SUB_ROW_CLASS}
                  >
                    {manufacturer.name}
                  </Link>
                )),
              )}
              <Link
                href={navHref.allManufacturers}
                onClick={onNavigate}
                className="block px-4 pb-2 pt-1 text-sm font-semibold text-primary-500 hover:text-primary-600"
              >
                {t("nav.allManufacturers")}
              </Link>
            </AccordionContent>
          </AccordionItem>
        )}

        {items.some((item) => item.dropdown === "scales") && (
          <AccordionItem value="scales">
            <AccordionTrigger>
              {items.find((item) => item.dropdown === "scales")?.label}
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2 px-4 py-2">
                {scaleItems.map((scale) => (
                  <Link
                    key={scale}
                    href={navHref.scale(scale)}
                    onClick={onNavigate}
                    className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary-200 hover:bg-surface-alt hover:text-primary-600"
                  >
                    {scale}
                  </Link>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </nav>
  );
}
