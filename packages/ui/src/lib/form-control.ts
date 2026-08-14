/** @format */

/**
 * Metin girilebilen form alanlarının yazı boyutu — TEK kaynak.
 *
 * iOS Safari, font-size'ı 16px'in ALTINDA olan bir metin alanına odaklanınca
 * sayfayı otomatik büyütür ve geri döndürmez: kullanıcı formu doldururken
 * düzen kayar, sonraki alanlar ekran dışında kalır. Tarayıcı bunu
 * `maximum-scale`/`user-scalable=no` ile bastırmak da bir seçenek değil —
 * o, kullanıcının kendi yakınlaştırmasını da öldürür (WCAG 1.4.4 ihlali).
 * Tek doğru çözüm alanı mobilde 16px yapmaktır.
 *
 * Bu yüzden her metin alanı küçük ekranda `text-base` (16px), `sm` ve
 * üstünde tasarımın öngördüğü 14px'e (`text-sm`) döner. `lg` boyutu zaten
 * `text-base` olduğu için bu sabite ihtiyaç duymaz.
 *
 * Gerçek metin alanı OLMAYAN kontroller (checkbox, radio, range, file ve
 * Radix tabanlı `Select` tetikleyicisi gibi `button` yüzeyler) odakta zoom
 * tetiklemez; onlar bu sabiti yalnızca yan yana durdukları alanlarla aynı
 * ölçekte görünsünler diye kullanır.
 */
export const CONTROL_TEXT = "text-base sm:text-sm";
