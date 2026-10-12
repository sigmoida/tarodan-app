/**
 * Bir METNİN elektronik tabloda FORMÜL olarak yorumlanmasını engeller.
 *
 * Excel ve Google Sheets `=`, `+`, `-`, `@` ve sekme/satır başı ile başlayan
 * hücreyi formül sayar: kullanıcının yazdığı bir ürün başlığı, dosyayı açan
 * kişinin makinesinde çalışan bir komuta dönüşebilir (CSV/formula injection).
 * Tek tırnak öneki hücreyi metne sabitler.
 *
 * YALNIZ metin alır. Sayı hücresi formül değildir: eski CSV yazıcısı her
 * değeri metne çevirip nötrlediği için `-125,50` gibi bir iade tutarı `'-125.5`
 * metnine dönüşüyor, dosyada toplanamıyordu.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
