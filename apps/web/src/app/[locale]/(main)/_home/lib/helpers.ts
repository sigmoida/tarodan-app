import { getOptimizedImageUrl } from "@/components/OptimizedImage";
import { DEMO_PRODUCT_IMAGES } from "./constants";

/** Stable 32-bit string hash → deterministic demo-placeholder pick (no render-time
 *  `Math.random()`, which is non-deterministic and an SSR-hydration hazard). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const getImageUrl = (
  image: any,
  index?: number,
  productTitle?: string,
): string => {
  // When no explicit index is given, derive a stable one from the image/title so
  // the same item always resolves to the same placeholder.
  const seed = index ?? hashString(String(image ?? productTitle ?? ""));
  const demoIdx = seed % DEMO_PRODUCT_IMAGES.length;
  const placeholder = DEMO_PRODUCT_IMAGES[demoIdx];
  return getOptimizedImageUrl(image, placeholder, productTitle, "card");
};
