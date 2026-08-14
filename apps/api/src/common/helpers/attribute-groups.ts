import { transliterateTurkish } from "./turkish-text";

/**
 * Global (üreticiden bağımsız) attribute gruplarının slug'ları ve renk
 * kataloğu.
 *
 * Ölçek/malzeme/renk üç yerde birden geçiyor (filtre üretimi, where kurulumu,
 * ürün yazma yolu). Slug'lar serbest string olarak dolaşınca bir taraf
 * değişince diğerleri sessizce eşleşmiyordu; tek kaynak burasıdır.
 */
export const SCALE_GROUP_SLUG = "scale";
export const MATERIAL_GROUP_SLUG = "material";
export const COLOR_GROUP_SLUG = "color";

/** İlan başına seçilebilecek en fazla renk sayısı (web formu ile ortak kural). */
export const MAX_PRODUCT_COLORS = 3;

/** `products.color` denormalize kolonunda renk adlarını birleştiren ayraç. */
export const COLOR_LABEL_SEPARATOR = ", ";

export interface ColorCatalogEntry {
  /** Attribute.slug — URL'de ve API filtresinde kullanılan ASCII kimlik. */
  slug: string;
  /** Attribute.value / displayValue — kullanıcıya görünen Türkçe ad. */
  name: string;
  /** Attribute.color — swatch için hex; "Çok Renkli" gibi değerlerde yok. */
  hex?: string;
  /**
   * Serbest metin renklerin (eski ilanlar, Excel toplu yükleme) bu değere
   * eşlenmesini sağlayan ek yazımlar. Ad ve slug ayrıca otomatik eşleşir.
   */
  aliases?: string[];
}

/**
 * Global "Renk" grubunun kanonik değerleri. Demo seed'i, launch veri dosyası ve
 * backfill script'i aynı listeden beslenir (bkz. attribute-groups.spec.ts).
 */
export const COLOR_CATALOG: ColorCatalogEntry[] = [
  { slug: "red", name: "Kırmızı", hex: "#DC2626", aliases: ["red"] },
  { slug: "blue", name: "Mavi", hex: "#2563EB", aliases: ["blue"] },
  { slug: "black", name: "Siyah", hex: "#000000", aliases: ["black"] },
  { slug: "white", name: "Beyaz", hex: "#FFFFFF", aliases: ["white"] },
  {
    slug: "gray",
    name: "Gri",
    hex: "#6B7280",
    aliases: ["grey", "gray", "fume"],
  },
  { slug: "silver", name: "Gümüş", hex: "#C0C0C0", aliases: ["silver"] },
  { slug: "gold", name: "Altın", hex: "#D4AF37", aliases: ["gold", "altin"] },
  { slug: "yellow", name: "Sarı", hex: "#FACC15", aliases: ["yellow"] },
  { slug: "orange", name: "Turuncu", hex: "#F97316", aliases: ["orange"] },
  { slug: "green", name: "Yeşil", hex: "#16A34A", aliases: ["green"] },
  { slug: "purple", name: "Mor", hex: "#7C3AED", aliases: ["purple"] },
  { slug: "pink", name: "Pembe", hex: "#EC4899", aliases: ["pink"] },
  {
    slug: "brown",
    name: "Kahverengi",
    hex: "#92400E",
    aliases: ["brown", "kahve"],
  },
  { slug: "beige", name: "Bej", hex: "#E8DCC4", aliases: ["beige"] },
  { slug: "maroon", name: "Bordo", hex: "#7F1D1D", aliases: ["maroon"] },
  { slug: "navy", name: "Lacivert", hex: "#1E3A8A", aliases: ["navy"] },
  {
    slug: "turquoise",
    name: "Turkuaz",
    hex: "#14B8A6",
    aliases: ["turquoise", "teal"],
  },
  { slug: "chrome", name: "Krom", hex: "#C0C0C0", aliases: ["chrome"] },
  {
    slug: "multicolor",
    name: "Çok Renkli",
    aliases: ["multicolor", "multi color", "cok renk", "renkli"],
  },
];

export function normalizeColorToken(value: string): string {
  return transliterateTurkish(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[\s-]+/g, " ")
    .trim();
}

/**
 * Serbest metin renk alanını tek tek renklere böler ("Siyah / Kırmızı",
 * "beyaz ve mavi", "mavi-gri"). Tekrarlar normalize edilmiş biçime göre atılır.
 */
export function splitColorText(value: string): string[] {
  const parts = value
    .split(/[,;/|+&]| ve | ile |-/gi)
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = normalizeColorToken(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/** Kataloğun eşleştirme indeksi: normalize edilmiş her yazım → renk slug'ı. */
const COLOR_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const entry of COLOR_CATALOG) {
    for (const token of [entry.slug, entry.name, ...(entry.aliases ?? [])]) {
      const key = normalizeColorToken(token);
      if (key && !map.has(key)) map.set(key, entry.slug);
    }
  }
  return map;
})();

/**
 * Serbest metin bir rengi katalog slug'ına çevirir; eşleşme yoksa null.
 * Katalog dışı renkler adminden eklenebildiği için çağıran taraf ayrıca
 * veritabanına bakmalıdır — burada yalnız kanonik liste bilinir.
 */
export function matchColorSlug(value: string): string | null {
  return COLOR_LOOKUP.get(normalizeColorToken(value)) ?? null;
}

/**
 * `products.color` kolonuna yazılacak değer: seçilen renklerin adları, seçim
 * yoksa eski istemcinin serbest metni, o da yoksa null.
 */
export function colorColumnValue(
  labels: string[],
  freeText?: string | null,
): string | null {
  if (labels.length) return labels.join(COLOR_LABEL_SEPARATOR);
  const trimmed = freeText?.trim();
  return trimmed ? trimmed : null;
}

/** Veritabanındaki bir renk seçeneği (adminin eklediği katalog dışı renkler dahil). */
export interface ColorOption {
  slug: string;
  label: string;
}

export interface ResolvedColorText {
  /** Eşleşen renklerin slug'ları (girişteki sıra korunur, tekrar yok). */
  slugs: string[];
  /** Eşleşen renklerin kanonik adları — denormalize kolona bu yazılır. */
  labels: string[];
  /** Hiçbir renge bağlanamayan parçalar (rapor/serbest metin olarak korunur). */
  unmatched: string[];
}

/**
 * Serbest metin renk alanını ("Siyah / Kırmızı", "Altın-Kahverengi") mevcut
 * renk seçeneklerine çözer.
 *
 * Eski ilanların backfill'i, Excel toplu yüklemesi ve launch seed'i aynı
 * eşleştirmeyi kullanır; kurallar tek yerde durmazsa üç taraf farklı sonuç
 * üretiyor. Sıra: birebir eşleşme → katalog eşanlamı → kelime bazlı ön ek
 * (yalnız TEK aday varsa; "Mint Yeşili" → yeşil, "Füme" → eşleşmez).
 */
export function resolveColorsFromText(
  value: string,
  options: ColorOption[],
): ResolvedColorText {
  const bySlug = new Map(options.map((option) => [option.slug, option]));
  const exact = new Map<string, string>();
  for (const option of options) {
    for (const token of [option.slug, option.label]) {
      const key = normalizeColorToken(token);
      if (key && !exact.has(key)) exact.set(key, option.slug);
    }
  }
  // Katalog eşanlamları yalnız veritabanında karşılığı olan renkler için geçerli.
  for (const [key, slug] of COLOR_LOOKUP) {
    if (!exact.has(key) && bySlug.has(slug)) exact.set(key, slug);
  }

  const slugs: string[] = [];
  const labels: string[] = [];
  const unmatched: string[] = [];

  for (const part of splitColorText(value)) {
    const key = normalizeColorToken(part);
    let slug = exact.get(key) ?? null;
    if (!slug) slug = prefixMatch(key, exact);
    if (!slug) {
      unmatched.push(part);
      continue;
    }
    if (slugs.includes(slug)) continue;
    slugs.push(slug);
    labels.push(bySlug.get(slug)?.label ?? slug);
  }

  return { slugs, labels, unmatched };
}

/** "mint yesili" → yesil. Birden fazla aday çıkarsa eşleşme sayılmaz. */
function prefixMatch(key: string, exact: Map<string, string>): string | null {
  const found = new Set<string>();
  for (const word of key.split(" ")) {
    if (word.length < 3) continue;
    for (const [candidate, slug] of exact) {
      if (candidate.length >= 3 && word.startsWith(candidate)) found.add(slug);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}
