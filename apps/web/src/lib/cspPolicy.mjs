/**
 * Content Security Policy — tek kaynak.
 *
 * NEDEN: PayTR Direkt API'de kart alanları BİZİM sayfamızda toplanıp doğrudan
 * PayTR'ye POST edilir (iframe değil). Bu, ödeme sayfasını PCI DSS 4.0'ın 6.4.3
 * (ödeme sayfası script'lerinin yetkilendirilmesi + envanteri) ve 11.6.1
 * (yetkisiz değişiklik tespiti) maddelerinin kapsamına sokar. CSP bu iki maddenin
 * pratikteki karşılığıdır: hangi script'in çalışabileceğini tarayıcıya yazılı
 * olarak bildirir ve ihlalleri raporlar.
 *
 * ROLLOUT: ödeme rotasında ZORLAYICI (enforce), diğer her yerde SALT-RAPOR
 * (report-only). Böylece kart sayfası ilk günden korunur, geri kalan sitede
 * ihlal envanteri gerçek trafikle toplanır ve hiçbir sayfa aniden bozulmaz.
 *
 * Politika hem middleware'de (runtime header) hem de testlerde kullanılabilsin
 * diye saf `.mjs`: `siteLockPolicy.mjs` ile aynı kalıp.
 */

export const CSP_ENFORCE_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

/** Kart alanlarının POST edildiği tek hedef (useCardPayment de bunu doğrular). */
const PAYTR_ORIGIN = "https://www.paytr.com";
/** Apple ile giriş — YALNIZ auth sayfalarında, ödeme sayfasında ASLA. */
const APPLE_SCRIPT_ORIGIN = "https://appleid.cdn-apple.com";
const APPLE_AUTH_ORIGIN = "https://appleid.apple.com";
/** Ürün görselleri (next.config images.remotePatterns ile aynı kaynaklar). */
const IMAGE_ORIGINS = [
  "https://amzn-tarodan.s3.eu-west-1.amazonaws.com",
  "https://s3.eu-west-1.amazonaws.com",
];

/**
 * Kart alanlarının TOPLANDIĞI sayfalar — locale önekli (`/en/…`) ve öneksiz
 * biçimi de kapsar. Middleware locale'i zaten ayırır; tarayıcı tarafı (Sentry
 * init, route guard) ise ham `location.pathname` görür — tek yardımcı ikisine
 * de hizmet etsin.
 *
 * İKİ rota vardır ve ikisi de kart girdisi alır:
 *   * `/cart/payment` — tek sayfalık checkout (asıl akış: adres + kart + öde)
 *   * `/payment/<id>` — yarım kalmış bir ödemeye dönüş
 * PCI DSS 6.4.3/11.6.1 kapsamı sayfanın adına değil, kart alanı içermesine
 * bağlıdır; checkout kart formunu devraldığında burası da genişletilmelidir.
 */
export function isPaymentPath(pathname) {
  if (typeof pathname !== "string") return false;
  return /^(?:\/[a-z]{2})?\/(?:payment(?:\/|$)|cart\/payment(?:\/|$))/.test(
    pathname,
  );
}

/** Ödeme sayfasında zorla, kalan sitede yalnız raporla. */
export function cspHeaderName(isPayment) {
  return isPayment ? CSP_ENFORCE_HEADER : CSP_REPORT_ONLY_HEADER;
}

/**
 * Sentry DSN'inden CSP ihlal raporu uç noktasını türetir. Ayrı bir rapor
 * altyapısı kurmadan 11.6.1 için sinyal verir; DSN yoksa raporlama kapalıdır.
 * DSN biçimi: https://<publicKey>@<host>/<projectId>
 */
export function sentryReportUri(dsn) {
  if (typeof dsn !== "string" || dsn.trim() === "") return null;
  let url;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\//, "");
  if (!publicKey || !projectId) return null;
  return `${url.origin}/api/${projectId}/security/?sentry_key=${publicKey}`;
}

/** Yapılandırılmış bir URL'yi çıplak origin'e indirger; geçersizse null. */
export function safeOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

/** Sentry ingest origin'i (connect-src için) — DSN yoksa null. */
export function sentryIngestOrigin(dsn) {
  return safeOrigin(dsn);
}

/** Boş/yinelenen kaynakları ayıklayarak direktif satırı üretir. */
function directive(name, sources) {
  const unique = [...new Set(sources.filter(Boolean))];
  return unique.length ? `${name} ${unique.join(" ")}` : "";
}

/**
 * Politika metnini üretir.
 *
 * @param {object} options
 * @param {string} options.nonce            Bu istek için üretilmiş nonce (zorunlu).
 * @param {boolean} options.isPayment       Ödeme rotası mı (daraltılmış profil).
 * @param {boolean} options.isProduction    Dev araçlarına izin verilmesin mi.
 * @param {string|null} [options.apiOrigin]    Mutlak API origin'i (SSR/dış çağrılar).
 * @param {string|null} [options.wsOrigin]     Socket.io origin'i.
 * @param {string|null} [options.sentryOrigin] Sentry ingest origin'i.
 * @param {string|null} [options.reportUri]    İhlal raporu uç noktası.
 */
export function buildContentSecurityPolicy({
  nonce,
  isPayment = false,
  isProduction = true,
  apiOrigin,
  wsOrigin,
  sentryOrigin,
  reportUri,
} = {}) {
  if (!nonce) {
    // Nonce'suz politika Next'in satır içi hidrasyon script'lerini kırar; sessizce
    // 'unsafe-inline'a düşmek yerine PATLA — sessiz düşüş korumayı yok ederdi.
    throw new Error("CSP requires a per-request nonce");
  }

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // React Fast Refresh yalnız geliştirmede eval kullanır.
    !isProduction && "'unsafe-eval'",
    // Apple ile giriş auth sayfalarında; kart sayfasının yüzeyine SOKULMAZ.
    !isPayment && APPLE_SCRIPT_ORIGIN,
  ];

  // Kendi altyapımız ödeme sayfasında da erişilebilir kalır: sayfa storefront
  // chrome'unun içinde render edilir (Header/Footer + RealtimeProvider socket'i,
  // /gateway proxy'si). PCI 6.4.3'ün konusu ÜÇÜNCÜ TARAF script yüzeyidir;
  // kendi backend'imizi kesmek koruma değil arıza üretirdi.
  const connectSrc = [
    // Tarayıcı API'ye same-origin `/gateway` proxy'sinden gider.
    "'self'",
    // Hata raporlaması ödeme sayfasında da açık kalır (Replay kapalı — bkz. docs).
    sentryOrigin,
    apiOrigin,
    wsOrigin,
    !isProduction && "ws:",
    !isProduction && "wss:",
  ];

  const policy = [
    directive("default-src", ["'self'"]),
    directive("script-src", scriptSrc),
    // Tailwind/Next satır içi <style> ve `style={{…}}` nitelikleri üretir; nonce
    // stil NİTELİKLERİNİ kapsamadığı için burada 'unsafe-inline' kaçınılmaz.
    // Script yüzeyini daraltmak asıl korumadır — stil enjeksiyonu kart çalamaz.
    directive("style-src", ["'self'", "'unsafe-inline'"]),
    // Görseller her iki profilde de aynı: görsel script çalıştıramaz, kısıtlamak
    // koruma getirmez — ürün/avatar görselleri chrome'da her sayfada görünür.
    directive("img-src", ["'self'", "data:", "blob:", ...IMAGE_ORIGINS]),
    directive("font-src", ["'self'", "data:"]),
    directive("connect-src", connectSrc),
    // Kart alanlarının gidebileceği TEK dış hedef.
    directive("form-action", ["'self'", isPayment && PAYTR_ORIGIN]),
    directive("frame-src", [
      "'self'",
      isPayment ? PAYTR_ORIGIN : APPLE_AUTH_ORIGIN,
    ]),
    directive("frame-ancestors", ["'self'"]),
    // Göreli script URL'lerini başka origin'e kaçıran <base> enjeksiyonunu kapat.
    directive("base-uri", ["'none'"]),
    directive("object-src", ["'none'"]),
    isProduction && "upgrade-insecure-requests",
    reportUri && `report-uri ${reportUri}`,
  ].filter(Boolean);

  return policy.join("; ");
}
