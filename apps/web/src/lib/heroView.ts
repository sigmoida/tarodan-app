/** @format */

import { pickLocalized, type HeroSlideDto } from "@tarodan/types";
import { isExternalAdHref, safeAdHref } from "@/lib/ads/safeAdHref";

export interface ResolvedHeroCta {
  label: string;
  href: string;
  /** Dış adres → yeni sekme; site-içi → locale-aware `Link`. */
  external: boolean;
}

type HeroCta = NonNullable<HeroSlideDto["cta1"]>;

/**
 * CTA'yı çizilebilir hâle getirir. Bağlantıyı admin yazar: güvensiz şema
 * (`javascript:` vb.) ya da boş etiket varsa CTA HİÇ çizilmez (`null`).
 */
export function resolveHeroCta(
  cta: HeroCta | null | undefined,
  locale: string,
): ResolvedHeroCta | null {
  if (!cta) return null;
  const href = safeAdHref(cta.href);
  const label = pickLocalized(cta.label, locale);
  if (!href || !label) return null;
  return { label, href, external: isExternalAdHref(href) };
}
