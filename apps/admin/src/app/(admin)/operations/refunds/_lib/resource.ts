/**
 * İadeler ekranının sorgu anahtarı (= invalidation hedefi). Eski iade
 * listesinin anahtarıyla AYNI: iade dosyasındaki mutasyonlar
 * (`invalidates: ["refund-requests"]`) liste ve sayaçları tazelemeye devam eder.
 */
export const REFUND_REQUESTS_RESOURCE = "refund-requests";
