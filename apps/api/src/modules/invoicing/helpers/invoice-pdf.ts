/**
 * Sağlayıcıdan çekilen blob gerçekten PDF mi?
 *
 * Sağlayıcının PDF yanıtı (eLogo: `getEArchiveInvoicePdfData`'nın EN BÜYÜK base64
 * bloğu) bir hata yanıtında imzalı XML, boş bir zarf ya da hata metni olabilir.
 * Her sağlayıcı adaptörü döndürmeden önce buna bakar. Doğrulanmadan
 * döndürülünce S3'e "fatura.pdf" adıyla yazılıyor ve müşteriye ek olarak
 * mailleniyordu. PDF olmayan veri belge DEĞİLDİR: `null` dönülür, çağıran
 * "PDF alınamadı" yolunu izler.
 */
const PDF_MAGIC = "%PDF-";

export function isPdfBuffer(buffer: Buffer | null | undefined): boolean {
  if (!buffer || buffer.length < PDF_MAGIC.length) return false;
  return buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC;
}

/**
 * Belge PDF'inin S3 yeri ve dosya kaydındaki varlık türü. İkisi de eLogo adını
 * taşır ama sağlayıcıdan bağımsızdır: mevcut nesneler `elogo-invoices/` altında
 * duruyor ve dosya kayıtları `elogo_invoice` türüyle yazıldı. Değiştirmek bir
 * S3 taşıma + veri güncellemesi ister (docs/INVOICING_PROVIDERS.md, Faz 5).
 */
export const INVOICE_PDF_STORAGE = {
  folder: "elogo-invoices",
  entityType: "elogo_invoice",
} as const;
