import type {
  UatRefreshRun,
  UatRefreshState,
  UatRefreshStatus,
} from "@/lib/api/system.types";

/** Çalışma sürerken durum ucu bu aralıkla yoklanır. */
export const UAT_REFRESH_POLL_MS = 10_000;

/** Onay penceresinde yazılması gereken ifade (API aynı değeri bekler). */
export const UAT_REFRESH_CONFIRM_PHRASE = "STAGING" as const;

type BadgeVariant = "default" | "success" | "warning" | "danger" | "outline";

/** Kuyrukta ya da çalışıyor: yeni yenileme başlatılamaz, durum yoklanır. */
export function isUatRefreshActive(
  state: UatRefreshState | null | undefined,
): boolean {
  return state === "queued" || state === "running";
}

/** Durumun rozet rengi (tek kaynak; kart ve geçmiş tablosu aynı haritayı okur). */
export function uatRefreshStateVariant(state: UatRefreshState): BadgeVariant {
  switch (state) {
    case "queued":
      return "outline";
    case "running":
      return "warning";
    case "succeeded":
      return "success";
    case "failed":
      return "danger";
  }
}

/** Durumun katalog anahtarı. */
export function uatRefreshStateKey(state: UatRefreshState) {
  return `admin.system.testTools.uatRefresh.state.${state}` as const;
}

/**
 * Süre (ms) → dakika + saniye. Negatif/geçersiz değer 0'a iner (saat farkı ya
 * da henüz başlamamış çalışma). Metni çağıran katalogdan kurar.
 */
export function splitDuration(ms: number): {
  minutes: number;
  seconds: number;
} {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

/** Süre metni; süre bilinmiyorsa "—". Kalıp çağıranın kataloğundan gelir. */
export function durationLabel(
  ms: number | null,
  render: (parts: { minutes: number; seconds: number }) => string,
): string {
  return ms === null ? "—" : render(splitDuration(ms));
}

/**
 * Bir çalışmanın süresi: bitmişse bitiş - başlangıç, sürüyorsa `now` - başlangıç.
 * Başlangıç damgası yoksa (kuyrukta) null.
 */
export function uatRefreshDurationMs(
  run: Pick<UatRefreshRun, "startedAt" | "finishedAt">,
  now: number,
): number | null {
  if (!run.startedAt) return null;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const ms = end - Date.parse(run.startedAt);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Takas sırasında API'ye ulaşılamaz: ağ hatası (yanıt yok) ya da önündeki
 * proxy'nin 502/503/504'ü. Bunlar aktif çalışmada "yenileniyor"dur, hata değil.
 */
export function isUatRefreshUnreachable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const response = (error as { response?: { status?: number } }).response;
  if (!response) return true;
  return (
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  );
}

/** Üretimde uç 404/403 döner; kart bu durumda hiç görünmez. */
export function isUatRefreshHiddenError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  return status === 404 || status === 403;
}

export type UatRefreshPhase =
  | "loading"
  | "hidden"
  | "notConfigured"
  | "active"
  | "swapping"
  | "idle"
  | "error";

/**
 * Kartın hangi hâlde olduğu. `data` hata sonrası da son başarılı yanıtı taşır
 * (react-query); bu yüzden "aktif çalışma + ulaşılamaz API" = takas sürüyor.
 * Hiç veri yokken ulaşılamazlık da "swapping" sayılır: sayfa takas ortasında
 * açılmış olabilir ve yoklama API dönene kadar sürer.
 */
export function uatRefreshPhase(
  data: UatRefreshStatus | undefined,
  error: unknown,
): UatRefreshPhase {
  if (error) {
    if (isUatRefreshHiddenError(error)) return "hidden";
    if (isUatRefreshUnreachable(error)) {
      return !data || isUatRefreshActive(data.current?.state)
        ? "swapping"
        : "error";
    }
    return "error";
  }
  if (!data) return "loading";
  if (!data.available) {
    return data.unavailableReason === "production" ? "hidden" : "notConfigured";
  }
  return isUatRefreshActive(data.current?.state) ? "active" : "idle";
}

/**
 * react-query `refetchInterval` kararı: yalnız çalışma sürerken (ya da takas
 * nedeniyle ulaşılamazken) yoklar; diğer hâllerde durur.
 */
export function uatRefreshPollInterval(
  data: UatRefreshStatus | undefined,
  error: unknown,
): number | false {
  const phase = uatRefreshPhase(data, error);
  return phase === "active" || phase === "swapping"
    ? UAT_REFRESH_POLL_MS
    : false;
}
