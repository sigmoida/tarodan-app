/**
 * Admin oturumunun bitiş anı.
 *
 * Süre artık ayardan geliyor (PlatformSetting `admin_session_timeout_minutes`),
 * bu yüzden panele sabit yazılamaz: tek doğru kaynak sunucudur. API her admin
 * yanıtına `x-admin-session-expires-at` başlığını koyar, buradaki depo da onu
 * tutar. Pencere KAYAN olduğu için her istek son tarihi ileriye taşır.
 *
 * Ayrı bir "ne kadar kaldı" ucu bilinçli olarak yok: o uç, sorduğu için
 * pencereyi uzatır ve açık unutulmuş bir sekmeyi sonsuza kadar canlı tutardı.
 */

const HEADER = "x-admin-session-expires-at";
/**
 * Sekmeler arası paylaşım. Pencere sunucuda TEK ve ortaktır: bir sekmedeki
 * istek onu herkes için ileri iter. Paylaşmazsak arka plandaki sekme, oturum
 * aslında canlıyken süresi dolmuş sanıp kullanıcıyı dışarı atardı.
 */
const STORAGE_KEY = "admin_session_deadline";

let deadlineMs: number | null = null;
const listeners = new Set<(deadline: number | null) => void>();

/** Yanıt başlığından son tarihi okur; başlık yoksa mevcut değeri KORUR. */
export function readSessionDeadline(headers: unknown): void {
  const raw = headerValue(headers, HEADER);
  if (!raw) return;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return;
  // Geriye giden bir değer yok sayılır: paralel isteklerin yanıtları sırasız
  // dönebilir ve eski bir son tarih uyarıyı erken tetiklerdi.
  setDeadline(parsed);
}

/**
 * Paralel isteklerin yanıtları sırasız dönebilir; aradaki fark saniyeler
 * mertebesindedir. Bu paydan KÜÇÜK geri gidişler sırasızlıktır, yok sayılır.
 */
const OUT_OF_ORDER_TOLERANCE_MS = 30_000;

/**
 * Depoyu ve diğer sekmeleri günceller.
 *
 * Küçük geri gidişler yok sayılır (sırasız yanıt), BÜYÜK geri gidişler
 * uygulanır: süre ayarı kısaldığında ya da uzun pencereli bir oturumun
 * ardından kısa pencereli yenisi açıldığında, depoda kalmış eski (ileri) son
 * tarih panelin ölü bir oturumu canlı sanmasına yol açardı — uyarı hiç çıkmaz,
 * kullanıcı yine habersiz atılırdı.
 */
function setDeadline(next: number): void {
  if (
    deadlineMs !== null &&
    next <= deadlineMs &&
    deadlineMs - next < OUT_OF_ORDER_TOLERANCE_MS
  ) {
    return;
  }
  if (next === deadlineMs) return;
  deadlineMs = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Depolama kapalı olabilir; sekme içi davranış yine doğru çalışır.
  }
  for (const listener of listeners) listener(deadlineMs);
}

/**
 * Diğer sekmelerin yazdığı son tarihi dinler. Bir kez çağrılır (AppShell).
 * Ayrıca açılışta depodaki değeri okur: yeni açılan sekme, ilk isteğini
 * yapana kadar son tarihi bilmezdi.
 */
export function startSessionDeadlineSync(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(stored) && stored > 0) setDeadline(stored);

  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    const parsed = Number(e.newValue);
    if (Number.isFinite(parsed)) setDeadline(parsed);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/**
 * Sunucu tarafında (RSC) çözülen son tarihi panele taşır. RSC'nin yaptığı
 * profil çağrısı da oturumu UZATIYOR ama yanıtı gateway proxy'sinden geçmediği
 * için başlığı tarayıcıya ulaşmıyordu: XHR atmayan bir sayfada panelin son
 * tarihi geride kalır, oturum sunucuda canlıyken kullanıcı erken atılırdı.
 */
export function publishServerDeadline(iso: string | null | undefined): void {
  if (!iso) return;
  const parsed = Date.parse(iso);
  if (Number.isFinite(parsed)) setDeadline(parsed);
}

export function getSessionDeadline(): number | null {
  return deadlineMs;
}

export function subscribeSessionDeadline(
  listener: (deadline: number | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Oturum kapandığında (logout / eject) depoyu boşaltır. */
export function clearSessionDeadline(): void {
  deadlineMs = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* yoksay */
  }
  for (const listener of listeners) listener(null);
}

/** Axios/fetch başlık taşıyıcılarının ortak okunuşu. */
function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  const bag = headers as {
    get?: (key: string) => string | null;
    [key: string]: unknown;
  };
  if (typeof bag.get === "function") return bag.get(name) ?? undefined;
  const direct = bag[name];
  return typeof direct === "string" ? direct : undefined;
}
