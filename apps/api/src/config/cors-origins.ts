/**
 * HTTP (main.ts) ve Socket.IO (websocket.gateway.ts) için TEK CORS allowlist'i.
 *
 * Kaynak `CORS_ORIGINS` env'idir; böylece alan adı değişikliği bir ortam
 * düzenlemesidir, kod değişikliği değil. Gateway eskiden kendi gömülü listesini
 * taşıyordu (`https://tarodan.com`, `https://admin.tarodan.com`) ve alan adı
 * taşındığında sessizce eski adrese bakmaya devam ediyordu: HTTP çalışırken
 * gerçek zamanlı mesaj/bildirim bağlantısı kopuyordu.
 *
 * Lokal geliştirmede env verilmeden çalışılabilsin diye üç localhost portu
 * yedek listedir; dağıtılan her ortamda `CORS_ORIGINS` set edilmelidir.
 */
const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
];

export function resolveCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : LOCAL_DEV_ORIGINS;
}
