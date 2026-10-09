import { isValidTckn } from "@tarodan/types";
import {
  UAT_MASK_EMAIL_DOMAIN,
  fakeBirthDate,
  fakeEmail,
  fakeFullName,
  fakeIban,
  fakePhone,
  fakeStreet,
  fakeTaxId,
  fakeTckn,
  fakeUsername,
} from "./masking-fakes";

/**
 * Serbest metin ve JSON içindeki kişisel veriyi temizleyen SAF fonksiyonlar.
 *
 * Kolon kuralları (`masking-catalog.ts`) bir kolonun TAMAMINI değiştirir; burada
 * ise içeriği korunan alanlar (mesaj metni, sipariş adres anlık görüntüsü, PayTR
 * ham yanıtı, denetim kaydı eski/yeni değeri) temizlenir:
 *  - serbest metin: e-posta, TR IBAN, TR cep telefonu ve checksum'ı geçen TCKN
 *    kalıpları sahte karşılığıyla değiştirilir; metnin geri kalanı aynen kalır;
 *  - JSON: anahtar adı kişisel veri söyleyen alanlar (fullName, phone, iban, ip,
 *    token …) sahte değer / null olur, diğer her metin değeri serbest metin
 *    kuralından geçer.
 *
 * Değiştirme anahtarı satırın anahtarı + JSON yolu + eşleşme sırasıdır, eşleşen
 * gerçek değer DEĞİL: sahte değer gerçeği ele vermez ve ikinci koşu aynı çıktıyı
 * üretir (idempotent) — maskelenmiş metindeki sahte e-posta atlanır, sahte
 * IBAN/telefon/TCKN aynı sıradaki aynı sahte değerle yeniden yazılır.
 */

/**
 * Tek geçişte taranan birleşik kalıp. Sıra önemli: e-posta önce yakalanır ki
 * yerel kısmındaki rakam dizisi telefon/TCKN sanılmasın; IBAN telefondan önce.
 */
const FREE_TEXT_PATTERN = new RegExp(
  [
    "(?<email>[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})",
    "(?<iban>\\bTR\\s?\\d{2}(?:\\s?\\d{4}){5}\\s?\\d{2}\\b)",
    "(?<phone>(?<!\\d)(?:\\+?90[\\s-]?|0)?5\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{2}[\\s-]?\\d{2}(?!\\d))",
    "(?<tckn>(?<!\\d)\\d{11}(?!\\d))",
  ].join("|"),
  "gi",
);

const MASKED_EMAIL_SUFFIX = `@${UAT_MASK_EMAIL_DOMAIN}`;

export function scrubFreeText(text: string, key: string): string {
  const seen = { email: 0, iban: 0, phone: 0, tckn: 0 };
  return text.replace(FREE_TEXT_PATTERN, (...args: unknown[]) => {
    const match = String(args[0]);
    const groups = args[args.length - 1] as Record<string, string | undefined>;
    if (groups.email) {
      const index = seen.email++;
      return match.toLowerCase().endsWith(MASKED_EMAIL_SUFFIX)
        ? match
        : fakeEmail(`${key}:email:${index}`);
    }
    if (groups.iban) return fakeIban(`${key}:iban:${seen.iban++}`);
    if (groups.phone) return fakePhone(`${key}:phone:${seen.phone++}`);
    if (groups.tckn && isValidTckn(match)) {
      return fakeTckn(`${key}:tckn:${seen.tckn++}`);
    }
    return match;
  });
}

export type JsonKeyKind =
  | "email"
  | "phone"
  | "iban"
  | "tckn"
  | "taxId"
  | "fullName"
  | "username"
  | "street"
  | "birthDate"
  | "drop";

/** `user_phone`, `guestEmail`, `IBAN` … → `userphone`, `guestemail`, `iban`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const IP_KEYS = new Set([
  "ip",
  "ipaddress",
  "clientip",
  "userip",
  "remoteip",
  "requestip",
  "lastloginip",
  "mandateip",
  "xforwardedfor",
  "forwardedfor",
]);

/**
 * JSON anahtar adı → kişisel veri türü (yoksa `null`). Kontrol sırası
 * çakışmaları çözer: `kepAddress` e-postadır, `ipAddress` IP'dir, `addressId`
 * yalnız bir kimliktir ve dokunulmaz; `recipientVknTckn` uzunluğu korunan vergi
 * numarasıdır. Yalın `name` bilinçli olarak YOK — kural/kategori/ürün adlarını
 * kişi adı sanırdı.
 */
export function classifyJsonKey(key: string): JsonKeyKind | null {
  const k = normalizeKey(key);
  if (!k) return null;
  if (IP_KEYS.has(k) || k.endsWith("ipaddress")) return "drop";
  if (/password|secret|token|apikey|authorization|cookie/.test(k)) {
    return "drop";
  }
  if (/email|eposta|kep/.test(k) || k === "mail") return "email";
  if (/iban/.test(k)) return "iban";
  if (/phone|gsm|telefon/.test(k) || /^mobile(number)?$/.test(k)) {
    return "phone";
  }
  if (/vkn|taxid|vergino/.test(k)) return "taxId";
  if (/tckn|nationalid|tckimlik|identitynumber|tcno/.test(k)) return "tckn";
  if (/birthdate|dogumtarihi/.test(k) || k === "dob") return "birthDate";
  if (k === "username") return "username";
  if (
    /fullname|firstname|lastname|surname|legalname|displayname|adsoyad/.test(
      k,
    ) ||
    /(^|account|card)holder(name)?$/.test(k) ||
    /(guest|recipient|buyer|seller|receiver|transfer|customer|contact|sender)name$/.test(
      k,
    )
  ) {
    return "fullName";
  }
  if (/addressids?$/.test(k)) return null;
  if (/address|street|addressline|acikadres/.test(k)) return "street";
  if (/zipcode|postalcode|postcode/.test(k)) return "drop";
  return null;
}

function fakeForKind(
  kind: Exclude<JsonKeyKind, "drop">,
  key: string,
  original: string,
): string {
  switch (kind) {
    case "email":
      return original.toLowerCase().endsWith(MASKED_EMAIL_SUFFIX)
        ? original
        : fakeEmail(key);
    case "phone":
      return fakePhone(key);
    case "iban":
      return fakeIban(key);
    case "tckn":
      return fakeTckn(key);
    case "taxId":
      return fakeTaxId(key, original);
    case "fullName":
      return fakeFullName(key);
    case "username":
      return fakeUsername(key);
    case "street":
      return fakeStreet(key);
    case "birthDate":
      return fakeBirthDate(key);
  }
}

/**
 * JSON değerini derinlemesine temizler. Şekil korunur: nesne/dizi yapısı ve
 * anahtarlar aynen kalır; kişisel anahtarın altındaki nesne (ör.
 * `billingAddress: {…}`) özyinelemeyle gezilir, metin değeri sahte değere,
 * `drop` türü ve kişisel anahtardaki sayı `null`'a döner.
 */
export function scrubJson(value: unknown, key: string, path = "$"): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      scrubJson(item, key, `${path}[${index}]`),
    );
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [field, inner] of Object.entries(value)) {
      const innerPath = `${path}.${field}`;
      const kind = classifyJsonKey(field);
      if (!kind || (inner !== null && typeof inner === "object")) {
        out[field] = scrubJson(inner, key, innerPath);
      } else if (inner === null || inner === "" || typeof inner === "boolean") {
        out[field] = inner;
      } else if (kind === "drop" || typeof inner !== "string") {
        out[field] = null;
      } else {
        out[field] = fakeForKind(kind, `${key}:${innerPath}`, inner);
      }
    }
    return out;
  }
  if (typeof value === "string") return scrubFreeText(value, `${key}:${path}`);
  return value;
}
