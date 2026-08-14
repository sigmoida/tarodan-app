/**
 * PAYTR_TEST_MODE: true / 1 / yes → test.
 *
 * Ayarlanmamışsa TEST kabul edilir — üretimde gerçek para çekmek bilinçli bir
 * yapılandırma gerektirsin diye, unutulan bir değişken canlı tahsilata
 * dönüşmesin.
 */
export function parsePaytrTestMode(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return true;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
