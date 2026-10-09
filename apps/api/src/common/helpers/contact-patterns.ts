/**
 * Metindeki iletişim verisini tanıyan kalıplar — TEK kaynak.
 *
 * İki kullanıcı var: mesajlaşmanın içerik filtresi (`ContentFilterService`
 * yerleşik kalıpları, DB boşken yedek) ve UAT maskelemesi
 * (`uat-masking/masking-scrub.ts`). Biri bir yazımı tanıyıp öteki tanımazsa
 * filtreden kaçan numara maskeden de kaçardı; bu yüzden kalıplar burada durur.
 *
 * Kaynaklar `new RegExp(source, "gi")` ile derlenecek düz metinlerdir;
 * yakalayan grup içermezler (birleşik kalıpta adlı gruplarla sarılabilsinler).
 */

/**
 * TR cep telefonu, yaygın yazımların hepsi:
 *   05321234567 · 5321234567 · +905321234567
 *   0532 123 45 67 · 0 532 123 45 67 · 0532-123-45-67 · 0532.123.45.67
 *   (0532) 123 45 67 · 0(532) 123 4567 · +90 (532) 123 45 67 · 90 532 123 45 67
 * Rakamla bitişik dizilerin parçası sayılmaz (sipariş/takip numarası içinden
 * 10 hane koparılmaz).
 */
export const TR_MOBILE_PHONE_PATTERN_SOURCE =
  "(?<!\\d)(?:\\+?90[\\s.\\-]{0,3}|0[\\s.\\-]{0,3})?" +
  "(?:\\(\\s?0?\\s?5\\d{2}\\s?\\)|5\\d{2})" +
  "[\\s.\\-]{0,3}\\d{3}[\\s.\\-]{0,3}\\d{2}[\\s.\\-]{0,3}\\d{2}(?!\\d)";

/** E-posta adresi. */
export const EMAIL_PATTERN_SOURCE =
  "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";

/** TR IBAN: `TR` + 24 rakam, dörtlü gruplar arasında tek boşluk olabilir. */
export const TR_IBAN_PATTERN_SOURCE =
  "\\bTR\\s?\\d{2}(?:\\s?\\d{4}){5}\\s?\\d{2}\\b";

/** Rakamla bitişik olmayan tam 11 hane — TCKN adayı (checksum ayrıca denenir). */
export const TCKN_CANDIDATE_PATTERN_SOURCE = "(?<!\\d)\\d{11}(?!\\d)";
