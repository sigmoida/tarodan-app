/**
 * Sekmelerin sorgu anahtarları (= invalidation hedefleri). İadeler sekmesi
 * eski iade listesinin anahtarını AYNEN kullanır: iade dosyasındaki
 * mutasyonlar (`invalidates: ["refund-requests"]`) listeyi tazelemeye devam eder.
 */
export const CANCELLATIONS_RESOURCE = "cancellations";
export const REFUND_REQUESTS_RESOURCE = "refund-requests";
