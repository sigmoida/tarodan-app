import { TR_WORD_CHARS } from "./contact-patterns";

/**
 * Deterministik Türkçe küfür/argo listesi — TEK kaynak (mesajlaşma süzgeci ve
 * ürün metni denetimi aynı listeyi kullanır). Detoxify (AI) tek/kısa
 * kelimelerde tutarsız olduğu için bilinen küfürleri skordan bağımsız yakalar.
 *
 * Türkçe harf katlaması: `i` bayrağı (`u`'suz) İ/ı'yı katlamaz — "SİKTİR"
 * kaçıyor, "SIK SIK" ("sık sık") ve "SIKIŞIK" yanlış yakalanıyordu. Bu yüzden
 * kalıplar bayraksız (yalnız `u`) yazılır ve metin ÖNCE normalize edilir; iki
 * görünüm taranır:
 *
 *  - tr: Türkçe küçük harf (İ→i, I→ı). Yazımı doğru Türkçe metin; "sıkışık"
 *    ile "sikiş" burada ayrışır.
 *  - ascii: büyük harf I→i, ÇĞÖŞÜ→CGOSU; açıkça yazılmış "ı" korunur.
 *    Aksan kullanmadan yazılan küfürleri ("serefsiz", "SIKTIR") yakalar.
 *
 * Türkçede meşru kelimelerle çakışan kısa kökler ("am", "sik") `ambiguous`
 * sınıfındadır: çağıran onları sert reddetmez (maske + inceleme). `ascii`
 * görünümde yalnız çakışmayan kökler aranır — "sik" ailesi ("sıktır",
 * "sıkık", "sıkış") yalnız doğru yazılmış `tr` görünümünde güçlüdür.
 *
 * Her iki görünüm de orijinal metinle AYNI uzunluktadır: eşleşme konumları
 * orijinal metne doğrudan uygulanır (maskeleme için).
 */

const WORD_START = `(?<![${TR_WORD_CHARS}])`;
const WORD_END = `(?![${TR_WORD_CHARS}])`;

/** Çok karakterli kökler (ek alabilir): kelime BAŞINDA aranır. */
const STRONG_TR =
  "orospu|amc[ıi]k|am[ıi]na|am[ıi]n[ıi]|siktir|sike[yn]|siki[mş]|sikik|sikey|yarr?a[gkğ]|kaltak|pezeven|kah[pb]e|ibne|ipne|gavat|kavat|sürtük|taşş?ak|puşt|yavşak|şerefsiz|götver|götoş|götlek|götveren|soka(?:y[ıi]m|r[ıi]m)|piçkuru|sülaleni|avradını|amına ?koy";

/** `ascii` görünümde aranan, meşru kelimeyle çakışmayan kökler. */
const STRONG_ASCII =
  "orospu|amcik|amina|amini|yarr?a[gk]|kaltak|pezeven|kah[pb]e|ibne|ipne|gavat|kavat|surtuk|tass?ak|pust|yavsak|serefsiz|gotver|gotos|gotlek|gotveren|soka(?:yim|rim)|pickuru|sulaleni|avradini|amina ?koy";

const strongTr = new RegExp(`${WORD_START}(?:${STRONG_TR})`, "u");
const strongAscii = new RegExp(`${WORD_START}(?:${STRONG_ASCII})`, "u");
/** Kısa ama belirsiz olmayan TAM kelimeler ("göt" yakalanır, "götür" yakalanmaz). */
const exactTr = new RegExp(`${WORD_START}(?:oç|piç|göt)${WORD_END}`, "u");
/** Türkçede yaygın meşru kelimeyle çakışan tam kelimeler ("sık sık", "8 am"). */
const ambiguousWord = new RegExp(`${WORD_START}(?:am|sik)${WORD_END}`, "gu");

const ASCII_FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/** Karakter başına eşleme: uzunluk korunur (UTF-16 birimi başına tek birim). */
function mapChars(text: string, map: (ch: string) => string): string {
  let out = "";
  for (const ch of text) {
    const mapped = map(ch);
    out += mapped.length === ch.length ? mapped : ch;
  }
  return out;
}

/** Türkçe küçük harf: İ→i, I→ı (locale/ICU'ya bağlı değil). */
export function trLowerCase(text: string): string {
  return mapChars(text, (ch) =>
    ch === "İ" ? "i" : ch === "I" ? "ı" : ch.toLowerCase(),
  );
}

/** ASCII'leştirilmiş görünüm: I→i, ÇĞÖŞÜ→CGOSU; açık "ı" korunur. */
function asciiLowerCase(text: string): string {
  return mapChars(trLowerCase(text.replace(/I/g, "i")), (ch) =>
    ch in ASCII_FOLD ? ASCII_FOLD[ch] : ch,
  );
}

function ranges(regex: RegExp, text: string): Array<[number, number]> {
  return [...text.matchAll(regex)].map((m): [number, number] => {
    const start = m.index ?? 0;
    return [start, start + m[0].length];
  });
}

export interface ProfanityScan {
  /** Belirsiz olmayan küfür: sert reddedilebilir. */
  strong: boolean;
  /** Belirsiz kısa kök konumları (`[başlangıç, bitiş)`), birleştirilmiş ve sıralı. */
  ambiguous: Array<[number, number]>;
}

export function scanProfanity(text: string | null | undefined): ProfanityScan {
  if (!text) return { strong: false, ambiguous: [] };
  const tr = trLowerCase(text);
  const ascii = asciiLowerCase(text);
  const strong =
    strongTr.test(tr) || exactTr.test(tr) || strongAscii.test(ascii);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of [
    ...ranges(ambiguousWord, tr),
    ...ranges(ambiguousWord, ascii),
  ].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return { strong, ambiguous: merged };
}

/** Küfür var mı (güçlü ya da belirsiz)? Sert/yumuşak ayrımı gerekmeyen çağıranlar için. */
export function hasProfanity(text: string | null | undefined): boolean {
  const scan = scanProfanity(text);
  return scan.strong || scan.ambiguous.length > 0;
}

/** Belirsiz kısa kökleri `***` ile maskeler (güçlü küfüre dokunmaz). */
export function maskAmbiguousProfanity(text: string): string {
  const { ambiguous } = scanProfanity(text);
  let out = "";
  let cursor = 0;
  for (const [start, end] of ambiguous) {
    out += text.slice(cursor, start) + "***";
    cursor = end;
  }
  return out + text.slice(cursor);
}
