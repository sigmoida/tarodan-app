/**
 * eLogo red METİNLERİNİN sınıflandırılması — yalnız eLogo adaptörü kullanır.
 *
 * Port sonucu (`EInvoiceErrorCategory`) sağlayıcıdan bağımsızdır; onu üretmek
 * için eLogo'nun Türkçe hata metinlerini tanımak gerekir ve bu bilgi başka bir
 * sağlayıcıda anlamsızdır. Ağ/erişilebilirlik kalıpları ise ortaktır:
 * `helpers/invoice-retry-policy.ts`.
 */

/**
 * Sağlayıcının BİZİM yapılandırmamızı reddettiği hatalar: XSLT görsel tasarımı
 * bulunamadı, tasarım hatası vb. Bunlar belgeye özgü değil, hesaba/ortama
 * özgüdür — bir belge düştüyse hepsi düşer ve yeniden denemek hiçbir şeyi
 * değiştirmez. Eskiden 8 deneme × 30 dk = 4 saat sessizce yeniniyor, ancak
 * sonra alarm çıkıyordu. Artık ilk redde bütçe tüketilmiş sayılır ve alarm
 * hemen görünür; düzeltme sonrası admin "Yeniden Dene" sayacı sıfırlar.
 */
const CONFIGURATION_PATTERNS = [
  "xslt",
  "tasarım hatası",
  "tasarim hatasi",
  "getxsltdocument",
];

export function isConfigurationElogoFailure(message?: string | null): boolean {
  if (!message) return false;
  const lower = message.toLocaleLowerCase("tr");
  return CONFIGURATION_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * eLogo "aynı fatura numarası tekrar kullanılamaz" reddi — paylaşımlı hesapta
 * numara çakışması. Yalnız yerel numaralandırmada anlamlıdır: teslim katmanı
 * yeni numara alıp yeniden dener.
 */
export function isDuplicateNumberElogoFailure(
  message?: string | null,
): boolean {
  if (!message) return false;
  const lower = message.toLocaleLowerCase("tr");
  return (
    lower.includes("tekrar kullanılamaz") ||
    lower.includes("aynı fatura numarası") ||
    (lower.includes("daha önce") && lower.includes("fatura"))
  );
}
