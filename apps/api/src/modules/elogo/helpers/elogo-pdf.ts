/**
 * eLogo `getEArchiveInvoicePdfData` yanıtından çıkarılan blob gerçekten PDF mi?
 *
 * Yanıttaki EN BÜYÜK base64 bloğu PDF kabul edilir; ama bir hata yanıtında bu
 * blok imzalı XML, boş bir zarf ya da hata metni olabilir. Doğrulanmadan
 * döndürülünce S3'e "fatura.pdf" adıyla yazılıyor ve müşteriye ek olarak
 * mailleniyordu. PDF olmayan veri belge DEĞİLDİR: `null` dönülür, çağıran
 * "PDF alınamadı" yolunu izler.
 */
const PDF_MAGIC = "%PDF-";

export function isPdfBuffer(buffer: Buffer | null | undefined): boolean {
  if (!buffer || buffer.length < PDF_MAGIC.length) return false;
  return buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
}
