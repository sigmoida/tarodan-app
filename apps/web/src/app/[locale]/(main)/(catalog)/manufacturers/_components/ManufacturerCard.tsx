/** @format */

"use client";

import Image from "next/image";
import { ChevronRightIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useManufacturers } from "../_context/ManufacturersContext";
import type { ManufacturerCard as ManufacturerCardData } from "../_lib/types";
import ManufacturerListingsPreview from "./ManufacturerListingsPreview";
import { useTranslations } from "next-intl";

export default function ManufacturerCard({
  brand,
}: {
  brand: ManufacturerCardData;
}) {
  const t = useTranslations();
  const { expandedBrand } = useManufacturers();
  const expanded = expandedBrand === brand.slug;

  return (
    <AccordionItem
      value={brand.slug}
      className={`overflow-hidden rounded-lg border bg-surface-elevated transition-all last:border-b ${
        expanded
          ? t("brands.manufacturerCard.borderPrimary300ShadowMd")
          : t("brands.manufacturerCard.borderBorderHoverBorderPrimary200")
      }`}
    >
      {/* Header — always visible; the trigger renders its own chevron.
			    Text column stretches to the logo height so title / description /
			    date sit stacked and vertically centred against the image. */}
      <AccordionTrigger className="items-stretch gap-4 p-3 hover:bg-surface sm:p-4">
        <div className="flex min-w-0 flex-1 items-stretch gap-4">
          <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface p-2 sm:h-20 sm:w-20">
            {brand.logoUrl ? (
              <Image
                src={brand.logoUrl}
                alt={brand.name}
                fill
                className="object-contain p-1"
                sizes="80px"
                unoptimized
              />
            ) : (
              <span className="text-xl font-bold text-subtle">
                {brand.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-heading sm:text-2xl">
                {brand.name}
              </h2>
              <span className="flex-shrink-0 text-sm">{brand.countryFlag}</span>
            </div>
            <p className="text-sm font-normal leading-snug text-muted text-left">
              {brand.description}
            </p>
            {brand.founded > 0 && (
              <span className="flex items-center gap-1 text-sm text-muted">
                <CalendarIcon className="h-4 w-4 flex-shrink-0" />
                {brand.founded}
              </span>
            )}
          </div>
        </div>
      </AccordionTrigger>

      {/* Expanded content */}
      <AccordionContent className="border-t border-border-subtle">
        <div className="space-y-4 pt-4">
          <ManufacturerListingsPreview manufacturerId={brand.id} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <div className="flex flex-wrap items-center gap-3">
              {(brand.founded > 0 || brand.country) && (
                <div className="flex items-center gap-2 rounded bg-surface px-3 py-1.5 text-xs">
                  <span className="font-bold text-heading">
                    {t("brands.manufacturerCard.kurulus")}
                  </span>
                  <span className="text-muted">
                    {[brand.founded > 0 ? brand.founded : null, brand.country]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded bg-surface px-3 py-1.5 text-xs">
                <span className="font-bold text-heading">
                  {t("brands.manufacturerCard.aktifIlan")}
                </span>
                <span className="font-semibold text-primary-600">
                  {brand.productCount ?? 0}
                </span>
              </div>
              {brand.website && (
                <a
                  href={brand.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded bg-surface px-3 py-1.5 text-xs text-info-600 transition-colors hover:text-info-800"
                >
                  <span className="font-bold">
                    {t("brands.manufacturerCard.webSitesi")}
                  </span>
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <ButtonLink
              variant="ghost"
              size="sm"
              href={`/listings?manufacturer=${encodeURIComponent(brand.name)}`}
              className="gap-1 text-primary-600 hover:text-primary-700"
            >
              {t("brands.manufacturerCard.allListingsOf", {
                brand: brand.name,
              })}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </ButtonLink>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
