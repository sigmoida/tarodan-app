import { createHash } from "crypto";
import { trIbanCheckDigits } from "../../validators/tr-iban";

/**
 * UAT maskelemesinin SAHTE DEĞER üreticileri — saf fonksiyonlar.
 *
 * Her değer bir ANAHTARDAN (satır id'si, ya da `kolon:yol` gibi türetilmiş bir
 * anahtar) türetilir: aynı production satırı her yenilemede aynı sahte kimliği
 * alır, böylece testçiler "geçen haftaki" kullanıcıyı yine bulur. Anahtar rastgele
 * UUID olduğundan sahte değerden gerçek değere geri gidilemez; gerçek değer hiçbir
 * üreticiye GİRDİ olarak verilmez (yalnız `taxId` uzunluğunu, `fileName` uzantısını
 * okur).
 *
 * Biçimler bilinçli olarak "gerçeğe benzer ama ulaşılamaz" seçildi:
 *  - e-posta `@uat.invalid` (RFC 2606: `.invalid` hiçbir zaman çözülmez → posta
 *    gerçek bir kişiye gidemez);
 *  - telefon `+90500…` (TR_PHONE_E164'e uyar; 500 hiçbir operatöre tahsisli değil);
 *  - TCKN ve IBAN checksum'ı geçer (formlar/payout doğrulaması patlamasın).
 *
 * `attempt` yalnız tekil kolonlarda çakışma çözmek içindir: 0 = taban değer.
 */

export const UAT_MASK_EMAIL_DOMAIN = "uat.invalid";

/** Sahte telefonların ortak öneki: `+90` + `500` (tahsissiz operatör kodu). */
export const UAT_MASK_PHONE_PREFIX = "+90500";

/** Tüm sahte değerlerin hash girdisi: tür ad alanı + anahtar (+ deneme). */
export function maskDigest(namespace: string, key: string, attempt = 0): string {
  const input =
    attempt > 0 ? `${namespace}:${key}#${attempt}` : `${namespace}:${key}`;
  return createHash("sha256").update(input).digest("hex");
}

/** Hash'ten `count` ondalık hane (en çok 32). */
function digitsFrom(hex: string, count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += String(parseInt(hex.slice(i * 2, i * 2 + 2), 16) % 10);
  }
  return out;
}

function indexFrom(hex: string, length: number): number {
  return parseInt(hex.slice(0, 8), 16) % length;
}

// Sabit Türkçe ad listeleri — "rastgele" ama tekrarlanabilir kimlikler için.
const FIRST_NAMES = [
  "Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "Hasan", "İbrahim", "Murat",
  "Emre", "Burak", "Can", "Deniz", "Eren", "Kaan", "Onur", "Serkan", "Tolga",
  "Volkan", "Yusuf", "Kerem", "Ayşe", "Fatma", "Emine", "Hatice", "Zeynep",
  "Elif", "Merve", "Büşra", "Esra", "Gizem", "Selin", "Derya", "Ebru", "Seda",
  "Özge", "Ceren", "Dilek", "Pınar", "Şule", "Nur",
] as const;

const LAST_NAMES = [
  "Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk",
  "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara",
  "Koç", "Kurt", "Özkan", "Şimşek", "Polat", "Korkmaz", "Erdoğan", "Güneş",
  "Aksoy", "Tekin", "Bulut", "Akın", "Ünal", "Güler",
] as const;

const STREET_NAMES = [
  "Lale", "Gül", "Menekşe", "Papatya", "Çınar", "Ihlamur", "Akasya", "Zambak",
  "Nergis", "Manolya", "Sedir", "Defne",
] as const;

export function fakeEmail(key: string, attempt = 0): string {
  return `u${maskDigest("email", key, attempt).slice(0, 12)}@${UAT_MASK_EMAIL_DOMAIN}`;
}

export function fakePhone(key: string, attempt = 0): string {
  return `${UAT_MASK_PHONE_PREFIX}${digitsFrom(maskDigest("phone", key, attempt), 7)}`;
}

/** Standart TCKN algoritmasını (bkz. `isValidTckn`) geçen 11 hane. */
export function fakeTckn(key: string, attempt = 0): string {
  const hex = maskDigest("tckn", key, attempt);
  const d = [
    (parseInt(hex.slice(0, 2), 16) % 9) + 1,
    ...digitsFrom(hex.slice(2), 8).split("").map(Number),
  ];
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  d.push((((odd * 7 - even) % 10) + 10) % 10);
  d.push(d.reduce((sum, digit) => sum + digit, 0) % 10);
  return d.join("");
}

/** 10 haneli vergi kimlik numarası biçimi (ilk hane sıfır değil). */
export function fakeVkn(key: string, attempt = 0): string {
  const hex = maskDigest("vkn", key, attempt);
  return `${(parseInt(hex.slice(0, 2), 16) % 9) + 1}${digitsFrom(hex.slice(2), 9)}`;
}

/**
 * Vergi no / TCKN ortak kolonları (`taxId`, `recipientVknTckn`): asıl değer 11
 * haneyse şahıs (TCKN), değilse kurum (VKN) biçimi korunur — fatura tipi
 * (e-arşiv / e-fatura) seçimi buna bakıyor.
 */
export function fakeTaxId(key: string, original: string | null): string {
  const digits = String(original ?? "").replace(/\D/g, "");
  return digits.length === 11 ? fakeTckn(key) : fakeVkn(key);
}

/** Checksum'ı geçerli TR IBAN (`isValidTrIban` ile aynı mod-97). */
export function fakeIban(key: string): string {
  const bban = digitsFrom(maskDigest("iban", key), 22);
  return `TR${trIbanCheckDigits(bban)}${bban}`;
}

export function fakeFirstName(key: string): string {
  return FIRST_NAMES[indexFrom(maskDigest("firstName", key), FIRST_NAMES.length)];
}

export function fakeLastName(key: string): string {
  return LAST_NAMES[indexFrom(maskDigest("lastName", key), LAST_NAMES.length)];
}

/**
 * Ad + soyad. Aynı anahtarla `fakeFirstName` / `fakeLastName` ile birebir aynı
 * kişi: kullanıcının yasal adı, adres alıcısı ve banka hesabı sahibi aynı
 * anahtarla (kullanıcı id'si) maskelenince tutarlı kalır.
 */
export function fakeFullName(key: string): string {
  return `${fakeFirstName(key)} ${fakeLastName(key)}`;
}

/** "UAT" önekli açık adres — ekranda sahte olduğu ilk bakışta görünsün. */
export function fakeStreet(key: string): string {
  const hex = maskDigest("street", key);
  const street = STREET_NAMES[indexFrom(hex, STREET_NAMES.length)];
  const no = (parseInt(hex.slice(8, 12), 16) % 150) + 1;
  const door = (parseInt(hex.slice(12, 14), 16) % 20) + 1;
  return `UAT ${street} Sokak No:${no} D:${door}`;
}

export function fakeCompanyName(key: string, attempt = 0): string {
  return `UAT Firma ${maskDigest("company", key, attempt).slice(0, 8).toUpperCase()}`;
}

/** `USERNAME_PATTERN`'e uyar: küçük harf/rakam, `_`, alfasayısal uçlar. */
export function fakeUsername(key: string, attempt = 0): string {
  return `uat_${maskDigest("username", key, attempt).slice(0, 10)}`;
}

/** 1960-01-01 … 2000-12-31 arası bir gün (`YYYY-MM-DD`); herkes reşit. */
export function fakeBirthDate(key: string): string {
  const start = Date.UTC(1960, 0, 1);
  const span = Math.floor((Date.UTC(2000, 11, 31) - start) / 86_400_000);
  const day = parseInt(maskDigest("birthDate", key).slice(0, 8), 16) % (span + 1);
  return new Date(start + day * 86_400_000).toISOString().slice(0, 10);
}

/** 64 hane hex — tekil token kolonları (bülten aboneliği iptal anahtarı). */
export function fakeToken(key: string, attempt = 0): string {
  return maskDigest("token", key, attempt);
}

/** Yüklenen dosyanın adı (kişi adı içerebilir) — uzantı korunur. */
export function fakeFileName(key: string, original: string | null): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(original ?? ""));
  const extension = match ? `.${match[1].toLowerCase()}` : "";
  return `document-${maskDigest("fileName", key).slice(0, 8)}${extension}`;
}
