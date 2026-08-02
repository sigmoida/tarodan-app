/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useState } from "react";
import type { BrandMarqueeItem } from "../lib/types";

function BrandMark({ brand }: { brand: BrandMarqueeItem }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!brand.logoUrl || imageFailed) {
    return (
      <span className="text-center text-xs font-semibold leading-tight text-muted transition-colors group-hover:text-primary-600">
        {brand.name}
      </span>
    );
  }

  return (
    <Image
      src={brand.logoUrl}
      alt={brand.name}
      fill
      className="object-contain p-1"
      sizes="(max-width: 640px) 96px, 112px"
      unoptimized
      onError={() => setImageFailed(true)}
    />
  );
}

export default function BrandsMarquee({
  items,
}: {
  items: BrandMarqueeItem[];
}) {
  // Every other home rail returns null when it has nothing to show. Without this
  // an empty catalog rendered a full-bleed masked band under the hero — a blank
  // gap that reads as a broken page rather than as "no brands yet".
  if (items.length === 0) return null;

  return (
    // Full-bleed: break out of the (main) content container to span the whole
    // viewport width, regardless of the max-w-screen-xl cap.
    <section className="py-4 mx-[calc(50%-50vw)] w-screen">
      <div
        className="relative w-full overflow-hidden"
        style={{
          // Fade the marquee out at the left/right edges instead of hard-cutting
          // where it overflows the viewport.
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)",
          maskImage:
            "linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)",
        }}
      >
        <div className="brands-marquee-track flex flex-nowrap items-center gap-6 px-2 sm:px-3">
          {[...items, ...items].map((brand, i) => (
            <Link
              key={`${brand.name}-${i}`}
              href={`/listings?manufacturer=${encodeURIComponent(brand.name)}`}
              className="flex-shrink-0 group"
            >
              <div className="w-24 h-14 sm:w-28 sm:h-16 bg-surface-elevated border border-border hover:border-primary-300 flex items-center justify-center p-2.5 transition-all hover:shadow-sm relative rounded">
                <BrandMark brand={brand} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
