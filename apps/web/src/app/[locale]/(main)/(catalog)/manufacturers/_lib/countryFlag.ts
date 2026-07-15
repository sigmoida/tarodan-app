// Ülke adı (Türkçe/İngilizce/ISO kod, serbest metin) → bayrak emoji.
// Admin üretici formunda ülke serbest metin girildiği için esnek eşleştirme:
// trim + küçük harf + Türkçe/aksan karakterlerini ASCII'ye indirgeme.
// Eşleşme yoksa boş döner; çağıran taraf '🌐'/'🌍' fallback'i kendisi koyar.

function normalizeCountry(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // birleşik aksan işaretlerini at (ç→c, ü→u, İ→i ...)
    .replace(/ı/g, "i"); // Türkçe noktasız ı → i
}

const COUNTRY_FLAGS: Record<string, string> = {
  // Türkiye
  turkiye: "🇹🇷",
  turkey: "🇹🇷",
  tr: "🇹🇷",
  // ABD
  abd: "🇺🇸",
  amerika: "🇺🇸",
  "amerika birlesik devletleri": "🇺🇸",
  usa: "🇺🇸",
  us: "🇺🇸",
  "united states": "🇺🇸",
  // Almanya
  almanya: "🇩🇪",
  germany: "🇩🇪",
  de: "🇩🇪",
  // İtalya
  italya: "🇮🇹",
  italy: "🇮🇹",
  it: "🇮🇹",
  // Fransa
  fransa: "🇫🇷",
  france: "🇫🇷",
  fr: "🇫🇷",
  // Japonya
  japonya: "🇯🇵",
  japan: "🇯🇵",
  jp: "🇯🇵",
  // Çin
  cin: "🇨🇳",
  china: "🇨🇳",
  cn: "🇨🇳",
  // Hong Kong
  "hong kong": "🇭🇰",
  hongkong: "🇭🇰",
  hk: "🇭🇰",
  // Tayland
  tayland: "🇹🇭",
  thailand: "🇹🇭",
  th: "🇹🇭",
  // İngiltere / Birleşik Krallık
  ingiltere: "🇬🇧",
  "birlesik krallik": "🇬🇧",
  uk: "🇬🇧",
  "united kingdom": "🇬🇧",
  england: "🇬🇧",
  gb: "🇬🇧",
  // İspanya
  ispanya: "🇪🇸",
  spain: "🇪🇸",
  es: "🇪🇸",
  // Güney Kore
  "guney kore": "🇰🇷",
  "south korea": "🇰🇷",
  korea: "🇰🇷",
  kr: "🇰🇷",
  // Tayvan
  tayvan: "🇹🇼",
  taiwan: "🇹🇼",
  tw: "🇹🇼",
  // Hindistan
  hindistan: "🇮🇳",
  india: "🇮🇳",
  in: "🇮🇳",
  // Brezilya
  brezilya: "🇧🇷",
  brazil: "🇧🇷",
  br: "🇧🇷",
  // Rusya
  rusya: "🇷🇺",
  russia: "🇷🇺",
  ru: "🇷🇺",
  // Avustralya
  avustralya: "🇦🇺",
  australia: "🇦🇺",
  au: "🇦🇺",
  // Kanada
  kanada: "🇨🇦",
  canada: "🇨🇦",
  ca: "🇨🇦",
  // Meksika
  meksika: "🇲🇽",
  mexico: "🇲🇽",
  mx: "🇲🇽",
  // Hollanda
  hollanda: "🇳🇱",
  netherlands: "🇳🇱",
  nl: "🇳🇱",
  // İsveç
  isvec: "🇸🇪",
  sweden: "🇸🇪",
  se: "🇸🇪",
  // İsviçre
  isvicre: "🇨🇭",
  switzerland: "🇨🇭",
  ch: "🇨🇭",
  // Avusturya
  avusturya: "🇦🇹",
  austria: "🇦🇹",
  at: "🇦🇹",
  // Polonya
  polonya: "🇵🇱",
  poland: "🇵🇱",
  pl: "🇵🇱",
  // Belçika
  belcika: "🇧🇪",
  belgium: "🇧🇪",
  be: "🇧🇪",
};

/** Ülke adından bayrak emoji döndürür; eşleşme yoksa boş string. */
export function countryToFlag(country?: string | null): string {
  if (!country) return "";
  return COUNTRY_FLAGS[normalizeCountry(country)] || "";
}
