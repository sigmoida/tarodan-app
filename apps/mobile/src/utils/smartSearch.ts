/**
 * Akıllı arama yönlendirmesi — web paritesi.
 *
 * Kullanıcı arama kutusuna bir şey yazdığında, metnin belirli desenlere uyması durumunda
 * doğrudan ilan listesine ilgili filtre uygulanmış şekilde yönlendirilir.
 *
 * Örnekler:
 *   "Porsche" → { category: 'brand', value: 'Porsche' }  → /listings?brand=Porsche
 *   "1:18"    → { category: 'scale', value: '1:18' }    → /listings?scale=1:18
 *   "Hot Wheels" → { category: 'manufacturer', value: 'Hot Wheels' }
 */

export type SmartSearchCategory = 'brand' | 'manufacturer' | 'scale' | 'generic';

export interface SmartSearchRoute {
  category: SmartSearchCategory;
  value: string;
  /** `/listings?...` query string (lead karakteri olmadan). */
  query: string;
}

// Bilinen markalar (araba üreticileri, web ile senkron)
const KNOWN_BRANDS = [
  'porsche', 'ferrari', 'lamborghini', 'bugatti', 'mclaren', 'maserati',
  'aston martin', 'rolls-royce', 'bentley',
  'bmw', 'mercedes', 'mercedes-benz', 'audi', 'volkswagen', 'vw',
  'toyota', 'honda', 'nissan', 'mazda', 'subaru', 'mitsubishi', 'lexus', 'infiniti',
  'ford', 'chevrolet', 'chevy', 'dodge', 'chrysler', 'jeep', 'cadillac', 'pontiac',
  'fiat', 'alfa romeo', 'lancia',
  'peugeot', 'renault', 'citroen', 'citroën',
  'hyundai', 'kia', 'genesis',
  'volvo', 'saab', 'skoda', 'seat',
  'tesla', 'lucid', 'rivian',
  'jaguar', 'land rover', 'range rover', 'mini', 'smart',
];

// Bilinen üreticiler (diecast üreticileri, web ile senkron)
const KNOWN_MANUFACTURERS = [
  'hot wheels', 'hotwheels', 'matchbox', 'greenlight', 'autoart', 'autoart racing',
  'kyosho', 'bburago', 'maisto', 'welly', 'jada',
  'minichamps', 'spark', 'ixo', 'altaya', 'deagostini', 'eaglemoss',
  'tamiya', 'revell', 'amt', 'aoshima', 'fujimi',
  'norev', 'solido', 'majorette',
  'tarmac works', 'tarmac', 'tsm', 'motormax', 'nzg', 'ottomobile', 'otto',
  'bbr', 'looksmart', 'almost real', 'cm model', 'fronti-art', 'dan wang',
];

// Ölçek regex: "1:18", "1/64", "1-43"
const SCALE_REGEX = /^1[:/-](\d{1,3})$/i;

/**
 * Bir arama metnini analiz eder ve mümkünse hedef rotayı döner.
 * Hiçbir desen eşleşmezse `generic` kategori + `search` query'si döner.
 */
export function resolveSmartSearch(raw: string): SmartSearchRoute {
  const input = (raw || '').trim();
  if (!input) return { category: 'generic', value: '', query: '' };

  const lower = input.toLowerCase();

  // 1. Ölçek kontrolü (en belirgin desen)
  const scaleMatch = input.match(SCALE_REGEX);
  if (scaleMatch) {
    const normalized = `1:${scaleMatch[1]}`;
    return {
      category: 'scale',
      value: normalized,
      query: `scale=${encodeURIComponent(normalized)}`,
    };
  }

  // 2. Bilinen üretici kontrolü (daha uzun isimler önce)
  const manufacturer = KNOWN_MANUFACTURERS
    .slice()
    .sort((a, b) => b.length - a.length)
    .find(m => lower === m || lower.startsWith(m + ' ') || lower.endsWith(' ' + m));
  if (manufacturer) {
    // Orijinal yazımı koru (Hot Wheels → "Hot Wheels")
    const canonical = manufacturer
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return {
      category: 'manufacturer',
      value: canonical,
      query: `manufacturer=${encodeURIComponent(canonical)}`,
    };
  }

  // 3. Bilinen marka kontrolü
  const brand = KNOWN_BRANDS.find(b => lower === b || lower.startsWith(b + ' ') || lower.endsWith(' ' + b));
  if (brand) {
    const canonical = brand
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return {
      category: 'brand',
      value: canonical,
      query: `brand=${encodeURIComponent(canonical)}`,
    };
  }

  // 4. Generic arama
  return {
    category: 'generic',
    value: input,
    query: `search=${encodeURIComponent(input)}`,
  };
}

/**
 * Arama sonucuna göre `/listings` URL'si üretir.
 * Kullanım: router.push(buildSmartSearchUrl(q))
 */
export function buildSmartSearchUrl(raw: string): string {
  const result = resolveSmartSearch(raw);
  return result.query ? `/listings?${result.query}` : '/listings';
}
