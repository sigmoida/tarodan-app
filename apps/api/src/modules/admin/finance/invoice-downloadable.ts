/**
 * Fatura listesinin `hasPdf` alanı panelde indirme butonunun ÇIKIP çıkmamasını
 * belirler; anlamı "PDF S3'te duruyor mu" DEĞİL, "bu belge indirilebilir mi".
 *
 * `/admin/invoices/:id/pdf` ucu, kopyası olmayan KESİLMİŞ bir belgeyi
 * e-Logo'dan canlı çekip S3'e yazar ve döndürür. Alan `pdfUrl`e bağlıyken
 * kesilmiş ama henüz kopyalanmamış belgelerde buton hiç görünmüyordu (canlıda
 * 71 belgenin 38'i). Kesim tamamlanmamışsa (ETTN veya numara yok) uç zaten
 * 404 verir, buton da çıkmamalıdır.
 */
export function isInvoiceDownloadable(invoice: {
  pdfUrl: string | null;
  ettn: string | null;
  invoiceNumber: string | null;
}): boolean {
  return !!invoice.pdfUrl || (!!invoice.ettn && !!invoice.invoiceNumber);
}
