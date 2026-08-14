/**
 * D3: Takas/teklif iptal gerekçeleri için TEK kaynak. `Trade.cancelReason` ve
 * `Offer.cancelReason` serbest metin kolonlardır; otomatik yollar buradaki
 * sabitleri yazar ki raporlama güvenle eşleştirebilsin (eskiden aynı literaller
 * 6 dosyaya kopyalanmıştı ve sessizce kayabiliyordu). Kullanıcı kaynaklı
 * iptallerde istemcinin gönderdiği serbest metin aynen saklanır.
 */
export const TRADE_CANCEL_REASON = {
  autoExpired: "Süre dolumu nedeniyle otomatik iptal",
  stockDepleted: "Stok tükendiği için otomatik iptal edildi",
  lostParcel:
    "Depoya ulaşmayan (kayıp) koli nedeniyle otomatik iptal — bekleme süresi doldu",
  adminForceCancelStuck: (detail: string): string =>
    `Admin force-cancel (stuck): ${detail}`,
} as const;

export const OFFER_CANCEL_REASON = {
  buyerCancelled: "Alıcı tarafından iptal edildi",
  stockDepleted: "Stok tükendiği için otomatik iptal edildi",
  orderCancelled: "Bağlı sipariş iptal edildiği için teklif kapatıldı",
  /**
   * Karşı teklif zinciri her turda YENİ bir satır açar ve öncekini `rejected`
   * yapar. Gerekçe yazılmazsa geçmişte "reddedildi" rozetleri birikiyor ve
   * kullanıcı pazarlığın reddedilmiş sanıyor; bu iki sabit o satırların
   * "devam etti" olduğunu söyler.
   */
  supersededBySellerCounter: "Satıcı karşı teklif verdiği için kapatıldı",
  supersededByBuyerCounter: "Alıcı yeni teklif verdiği için kapatıldı",
  listingDeleted: "İlan satıcı tarafından kaldırıldığı için teklif kapatıldı",
} as const;
