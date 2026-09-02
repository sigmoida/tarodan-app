/** @format */

import { isGlobalCustomAttributeGroup } from "@tarodan/types";

/**
 * Özel grup yardımcıları — ilan formunun ve kenar çubuğu filtrelerinin ortak
 * saf mantığı. Grup kuralının kendisi `@tarodan/types`'ta (sunucuyla ortak);
 * burada yalnız listeleri o kurala göre bölme/koruma var.
 */

export interface GroupLike {
  slug: string;
  manufacturerSlug: string | null;
}

/**
 * `/products/attribute-groups` yanıtını iki kovaya ayırır:
 *  - `global`: her ilanda sorulan genel özel gruplar (sabit üçlü ve gizli dışı),
 *  - `scoped`: seçili üreticiye bağlı gruplar (üretici yoksa boş).
 * Sabit üçlü (ölçek/malzeme/renk) hiçbir kovaya girmez; kendi alanları var.
 */
export function splitAttributeGroups<G extends GroupLike>(
  groups: readonly G[],
  manufacturerSlug?: string,
): { global: G[]; scoped: G[] } {
  const global: G[] = [];
  const scoped: G[] = [];
  for (const group of groups) {
    if (isGlobalCustomAttributeGroup(group)) global.push(group);
    else if (manufacturerSlug && group.manufacturerSlug === manufacturerSlug)
      scoped.push(group);
  }
  return { global, scoped };
}

/**
 * Formun zorunlu tutacağı grup slug'ları — API ile simetrik: yalnız genel özel
 * gruplar ve yalnız en az bir seçeneği olanlar (sunucu değeri olmayan zorunlu
 * grubu saymaz; form sayarsa satıcı seçemeyeceği bir alanda takılır).
 */
export function requiredGroupSlugsOf(
  globalGroups: ReadonlyArray<{
    slug: string;
    isRequired: boolean;
    attributes: ReadonlyArray<unknown>;
  }>,
): string[] {
  return globalGroups
    .filter((g) => g.isRequired && g.attributes.length > 0)
    .map((g) => g.slug);
}

/**
 * Seçim haritasından yalnız `keep` içindeki ve boş olmayan grupları bırakır.
 * Üretici değişince üreticiye bağlı seçimler düşer, genel seçimler kalır.
 */
export function keepAttributeGroups(
  selections: Record<string, string[]> | undefined,
  keep: Iterable<string>,
): Record<string, string[]> {
  const keepSet = new Set(keep);
  const next: Record<string, string[]> = {};
  for (const [slug, values] of Object.entries(selections ?? {})) {
    if (keepSet.has(slug) && values.length > 0) next[slug] = values;
  }
  return next;
}

/** İki seçim haritası aynı grupları aynı değerlerle mi taşıyor? */
export function sameAttributeSelections(
  a: Record<string, string[]> | undefined,
  b: Record<string, string[]> | undefined,
): boolean {
  const left = Object.entries(a ?? {}).filter(([, v]) => v.length > 0);
  const right = Object.entries(b ?? {}).filter(([, v]) => v.length > 0);
  if (left.length !== right.length) return false;
  const rightMap = new Map(right);
  return left.every(([slug, values]) => {
    const other = rightMap.get(slug);
    return (
      !!other &&
      other.length === values.length &&
      values.every((v, i) => other[i] === v)
    );
  });
}
