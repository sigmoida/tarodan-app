/**
 * Process role (Faz 7.2) — aynı kod tabanının hangi rolde koştuğunu belirler; API
 * ve arka-plan worker'ını AYRI process'lere bölmeyi konfigürasyonla mümkün kılar.
 *
 *  - `all`    (varsayılan): tek process — HTTP + tüm worker'lar (mevcut davranış).
 *  - `web`    : yalnız HTTP; ağır kuyruk worker'ları (WorkerModule) YÜKLENMEZ → ayrı
 *               worker deploy edildiğinde API onları taşımayı bırakır (kaynak izolasyonu).
 *  - `worker` : başsız (HTTP yok) — worker.ts AppModule'ü application-context olarak
 *               yükler; kuyruk worker'ları + `scheduled` processor'ları burada koşar.
 *
 * Rol `PROCESS_ROLE` env'inden okunur (process başına ayrı) → API servisine
 * `PROCESS_ROLE=web`, worker servisine `PROCESS_ROLE=worker` verilir. Bilinmeyen/boş
 * değer güvenli varsayılana (`all`) düşer, böylece tek-process deploy asla bozulmaz.
 */
export type ProcessRole = "all" | "web" | "worker";

const VALID_ROLES: ProcessRole[] = ["all", "web", "worker"];

export function getProcessRole(): ProcessRole {
  const raw = (process.env.PROCESS_ROLE || "").trim().toLowerCase();
  return (VALID_ROLES as string[]).includes(raw) ? (raw as ProcessRole) : "all";
}

/** Bu process ağır kuyruk worker'larını (WorkerModule) çalıştırmalı mı? (`web` hariç). */
export function runsQueueWorkers(
  role: ProcessRole = getProcessRole(),
): boolean {
  return role !== "web";
}

/** Bu process HTTP sunmalı mı? (`worker` hariç — worker başsız application-context). */
export function servesHttp(role: ProcessRole = getProcessRole()): boolean {
  return role !== "worker";
}
