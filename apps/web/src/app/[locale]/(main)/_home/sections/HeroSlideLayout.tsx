/** @format */

import { forwardRef, type ReactNode } from "react";
import type { HeroImageSide } from "@tarodan/types";

/** Hero slide title (admin slides and slides defined in code share the type). */
export const HERO_TITLE_CLASS =
  "mb-4 whitespace-pre-line font-display text-3xl font-bold leading-[1.1] tracking-tight text-heading md:mb-6 md:text-4xl lg:text-[3.25rem]";

/** Description text under the title. */
export const HERO_SUBTITLE_CLASS =
  "mb-6 max-w-lg text-base leading-relaxed text-muted md:text-lg";

/** CTA row: stacked on phones, side by side from `sm`. */
export const HERO_ACTIONS_CLASS = "flex flex-col gap-3 sm:flex-row";

/**
 * Skeleton of one hero slide: padding, the two-column grid and the image box.
 *
 * Order: on phones the image is ALWAYS on top and the text below; a narrow
 * screen has no room for the side-by-side layout, and an image at the bottom
 * was pushed off screen. From `md` the slide's `imageSide` applies.
 *
 * The image box ratio comes from the `mediaRatios` design token: 16:10 on
 * phones (`aspect-hero-compact`; 4:3 took half the height and pushed the title
 * below the fold), 4:3 from `md` (`aspect-hero-split`). The image fills the box
 * (`fill`), and the fixed ratio keeps every slide the same height.
 */
export const HeroSlideLayout = forwardRef<
  HTMLDivElement,
  {
    imageSide: HeroImageSide;
    media: ReactNode;
    children: ReactNode;
    /** Slide surface (e.g. the background); the shell itself is transparent. */
    className?: string;
    /** Surface of the image box. */
    mediaClassName?: string;
  }
>(function HeroSlideLayout(
  { imageSide, media, children, className = "", mediaClassName = "" },
  ref,
) {
  const imageRight = imageSide === "right";
  return (
    <div ref={ref} className={`h-full w-full ${className}`}>
      <div className="px-5 py-8 sm:px-8 md:px-10 md:py-14 lg:px-14 lg:py-16">
        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div
            className={`order-2 ${imageRight ? "md:order-1" : "md:order-2"}`}
          >
            {children}
          </div>
          <div
            className={`relative order-1 aspect-hero-compact w-full overflow-hidden rounded-lg md:aspect-hero-split ${
              imageRight ? "md:order-2" : "md:order-1"
            } ${mediaClassName}`}
          >
            {media}
          </div>
        </div>
      </div>
    </div>
  );
});
