/**
 * PayTR tutarlarını okur. Sağlayıcı ondalık ayırıcı olarak VİRGÜL dönebilir
 * ("10,8") ve araya boşluk koyabilir; ham `parseFloat` bunları sessizce yanlış
 * okur ("10,8" → 10). Durum sorgusu ve rapor servisleri aynı yanıtları okuduğu
 * için tek kaynaktan geçerler — iki kopya, iki farklı yuvarlama demekti.
 *
 * Okunamayan değer `null` döner; `0` ile karıştırılmasın diye bilinçli olarak
 * varsayılan verilmez.
 */
export function parsePaytrMoneyString(
  value: string | undefined,
): number | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
