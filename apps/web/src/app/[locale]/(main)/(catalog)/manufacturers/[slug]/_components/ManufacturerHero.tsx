/** @format */

"use client";

import Image from "next/image";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { countryToFlag } from "../../_lib/countryFlag";
import type { ManufacturerDetail } from "../../_lib/types";

/**
 * Compact manufacturer summary card — logo + country/founded badges + description
 * + website. The name, "back", and active-listing count live in the page's
 * `PageHeader`, so this stays a clean, token-driven card (no hero gimmicks).
 */
export default function ManufacturerHero({
  brand,
}: {
  brand: ManufacturerDetail;
}) {
  return (
    <div className="mb-8 flex flex-col gap-6 rounded-lg border border-border bg-surface-elevated p-6 sm:flex-row sm:items-start">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-surface p-3">
        {brand.logo ? (
          <Image
            src={brand.logo}
            alt={brand.name}
            width={72}
            height={72}
            unoptimized
            className="object-contain"
          />
        ) : (
          <span className="text-4xl font-black uppercase text-border-strong">
            {brand.name[0]}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {brand.country && (
            <Badge variant="secondary" size="sm">
              {countryToFlag(brand.country) || "🌍"} {brand.country}
            </Badge>
          )}
          {brand.foundedYear && (
            <Badge variant="secondary" size="sm">
              {brand.foundedYear}
            </Badge>
          )}
        </div>

        {brand.description && (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {brand.description}
          </p>
        )}

        {brand.website && (
          <a
            href={brand.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            <GlobeAltIcon className="h-4 w-4" />
            Web Sitesi
          </a>
        )}
      </div>
    </div>
  );
}
