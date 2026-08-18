/**
 * Turkish province plate codes — the single source of truth for turning a
 * province *name* into the numeric code carriers address parcels by.
 *
 * Sürat's older create endpoint took the province as a name and did the lookup
 * on its side. `GonderiOlustur` takes `IlId`, the province's plate code, so the
 * mapping became ours to own. An unresolved province must fail the shipment
 * rather than guess: a parcel addressed to the wrong province is worse than a
 * shipment that never opens, and the caller can surface a fixable error.
 *
 * This lives in `@tarodan/types` (not `@tarodan/shared`) for the same reason
 * `phone.ts` does: the API imports it at runtime, and `@tarodan/shared` is a
 * devDependency there, so a runtime import from it resolves to MODULE_NOT_FOUND
 * in the Docker image.
 *
 * Names match `apps/web/src/lib/turkeyLocations.ts`, the closed 81-province list
 * every address form picks from — so user-entered addresses always resolve.
 * There are deliberately **no aliases** ("Afyon", "K.Maraş", "İçel"): every
 * address in the system comes from that closed list, and the one free-text entry
 * point (the warehouse address in admin Settings) is expected to hold the full
 * official name. Guessing at abbreviations would trade a loud failure for a
 * silent mis-mapping.
 */

/** One province and its plate code, ordered by code. */
export interface TrProvince {
  plateCode: number;
  name: string;
}

/** All 81 provinces, ordered by plate code. */
export const TR_PROVINCES: readonly TrProvince[] = [
  { plateCode: 1, name: "Adana" },
  { plateCode: 2, name: "Adıyaman" },
  { plateCode: 3, name: "Afyonkarahisar" },
  { plateCode: 4, name: "Ağrı" },
  { plateCode: 5, name: "Amasya" },
  { plateCode: 6, name: "Ankara" },
  { plateCode: 7, name: "Antalya" },
  { plateCode: 8, name: "Artvin" },
  { plateCode: 9, name: "Aydın" },
  { plateCode: 10, name: "Balıkesir" },
  { plateCode: 11, name: "Bilecik" },
  { plateCode: 12, name: "Bingöl" },
  { plateCode: 13, name: "Bitlis" },
  { plateCode: 14, name: "Bolu" },
  { plateCode: 15, name: "Burdur" },
  { plateCode: 16, name: "Bursa" },
  { plateCode: 17, name: "Çanakkale" },
  { plateCode: 18, name: "Çankırı" },
  { plateCode: 19, name: "Çorum" },
  { plateCode: 20, name: "Denizli" },
  { plateCode: 21, name: "Diyarbakır" },
  { plateCode: 22, name: "Edirne" },
  { plateCode: 23, name: "Elazığ" },
  { plateCode: 24, name: "Erzincan" },
  { plateCode: 25, name: "Erzurum" },
  { plateCode: 26, name: "Eskişehir" },
  { plateCode: 27, name: "Gaziantep" },
  { plateCode: 28, name: "Giresun" },
  { plateCode: 29, name: "Gümüşhane" },
  { plateCode: 30, name: "Hakkari" },
  { plateCode: 31, name: "Hatay" },
  { plateCode: 32, name: "Isparta" },
  { plateCode: 33, name: "Mersin" },
  { plateCode: 34, name: "İstanbul" },
  { plateCode: 35, name: "İzmir" },
  { plateCode: 36, name: "Kars" },
  { plateCode: 37, name: "Kastamonu" },
  { plateCode: 38, name: "Kayseri" },
  { plateCode: 39, name: "Kırklareli" },
  { plateCode: 40, name: "Kırşehir" },
  { plateCode: 41, name: "Kocaeli" },
  { plateCode: 42, name: "Konya" },
  { plateCode: 43, name: "Kütahya" },
  { plateCode: 44, name: "Malatya" },
  { plateCode: 45, name: "Manisa" },
  { plateCode: 46, name: "Kahramanmaraş" },
  { plateCode: 47, name: "Mardin" },
  { plateCode: 48, name: "Muğla" },
  { plateCode: 49, name: "Muş" },
  { plateCode: 50, name: "Nevşehir" },
  { plateCode: 51, name: "Niğde" },
  { plateCode: 52, name: "Ordu" },
  { plateCode: 53, name: "Rize" },
  { plateCode: 54, name: "Sakarya" },
  { plateCode: 55, name: "Samsun" },
  { plateCode: 56, name: "Siirt" },
  { plateCode: 57, name: "Sinop" },
  { plateCode: 58, name: "Sivas" },
  { plateCode: 59, name: "Tekirdağ" },
  { plateCode: 60, name: "Tokat" },
  { plateCode: 61, name: "Trabzon" },
  { plateCode: 62, name: "Tunceli" },
  { plateCode: 63, name: "Şanlıurfa" },
  { plateCode: 64, name: "Uşak" },
  { plateCode: 65, name: "Van" },
  { plateCode: 66, name: "Yozgat" },
  { plateCode: 67, name: "Zonguldak" },
  { plateCode: 68, name: "Aksaray" },
  { plateCode: 69, name: "Bayburt" },
  { plateCode: 70, name: "Karaman" },
  { plateCode: 71, name: "Kırıkkale" },
  { plateCode: 72, name: "Batman" },
  { plateCode: 73, name: "Şırnak" },
  { plateCode: 74, name: "Bartın" },
  { plateCode: 75, name: "Ardahan" },
  { plateCode: 76, name: "Iğdır" },
  { plateCode: 77, name: "Yalova" },
  { plateCode: 78, name: "Karabük" },
  { plateCode: 79, name: "Kilis" },
  { plateCode: 80, name: "Osmaniye" },
  { plateCode: 81, name: "Düzce" },
];

/**
 * Turkish letters folded to ASCII before comparison.
 *
 * `toLowerCase()` alone cannot do this: it maps `I` to `i` (wrong in Turkish,
 * but harmless once both sides are folded) and `İ` to `i` + U+0307 (a combining
 * dot that then fails a plain string compare). Folding explicitly, per
 * character, keeps `İSTANBUL`, `Istanbul` and `istanbul` on the same key.
 */
const TR_FOLD: Readonly<Record<string, string>> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

/**
 * Comparison key for a province name: ASCII-folded, lower-cased, with every
 * separator dropped. Dropping separators is what lets "Afyon Karahisar" and
 * "Afyonkarahisar" — the same province spelled two ways — land on one key.
 */
export function normalizeProvinceName(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  let folded = "";
  for (const char of raw) {
    folded += TR_FOLD[char] ?? char.toLowerCase();
  }
  return folded
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const PLATE_CODE_BY_NORMALIZED_NAME = new Map(
  TR_PROVINCES.map((province) => [
    normalizeProvinceName(province.name),
    province.plateCode,
  ]),
);

/**
 * The plate code for a province name, or `null` when the name is not one of the
 * 81 provinces. Callers must treat `null` as a hard stop — see the file header.
 */
export function resolveTrPlateCode(
  name: string | null | undefined,
): number | null {
  const key = normalizeProvinceName(name);
  if (!key) return null;
  return PLATE_CODE_BY_NORMALIZED_NAME.get(key) ?? null;
}
