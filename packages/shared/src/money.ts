/**
 * "12,30 TL" — uygulamalar arasındaki TEK Türk Lirası biçimlendiricisi.
 *
 * Vitrin ve ilan formu aynı tutarı aynı biçimde göstermek zorunda; ilan formu
 * iki uygulamada da çalıştığı için biçimlendirici de paylaşılan yerde durur.
 * Intl örneği bir kez kurulup yeniden kullanılır — pahalı olan kurulumdur,
 * biçimlendirmenin kendisi ucuzdur.
 */
const tlNumberFmt = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined) {
    return "0,00 TL";
  }

  const numPrice = typeof price === "string" ? parseFloat(price) : price;

  if (isNaN(numPrice)) {
    return "0,00 TL";
  }

  return `${tlNumberFmt.format(numPrice)} TL`;
}

/** {@link formatPrice} takma adı — profil yüzeylerinde kullanılan ad. */
export const formatTL = formatPrice;
