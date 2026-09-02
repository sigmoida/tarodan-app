import type { Breadcrumb, Event } from "@sentry/node";
import { getRequestId } from "../../common/context/request-context";
import {
  redactSensitive,
  redactUrlQuery,
} from "../../common/security/redact-sensitive";

/**
 * Sentry'ye giden her olayın geçtiği tek kapı (Sentry.init → beforeSend).
 *
 * Korelasyon kimliği `extra` değil TAG olarak eklenir: extra alanları
 * aranamaz, oysa asıl senaryo kullanıcının destek talebinde verdiği kodu
 * Sentry arama çubuğuna `requestId:...` diye yazmaktır.
 */
export function applySentryEventPolicy<T extends Event>(event: T): T | null {
  // Sağlık kontrolleri dakikada bir koşar; issue listesini boğar.
  if (event.request?.url?.includes("/health")) return null;

  const requestId = getRequestId();
  if (requestId) {
    event.tags = { ...event.tags, requestId };
  }

  return redactSensitive(event) as T;
}

/**
 * Sentry breadcrumb'larının geçtiği tek kapı (Sentry.init → beforeBreadcrumb);
 * API ve worker süreçleri AYNI fonksiyonu kullanmalı.
 *
 * Neden ayrı bir kapı: Sentry'nin varsayılan fetch/undici entegrasyonu her dış
 * çağrıyı `http` breadcrumb'ı olarak URL'iyle birlikte kaydeder. Sürat takip
 * sözleşmesi kimliği (`CariKodu`/`Sifre`) query parametresinde taşıdığı için
 * canlıda şifre Sentry olaylarında düz metin göründü. `redactSensitive` anahtar
 * adına bakar, URL'yi ayrıştırmaz; o yüzden `url` ve `http.query` alanları ayrıca
 * `redactUrlQuery`'den geçirilir.
 */
export function applySentryBreadcrumbPolicy<T extends Breadcrumb>(
  breadcrumb: T,
): T | null {
  const url = breadcrumb.data?.url;
  // Sağlık kontrolleri dakikada bir koşar; breadcrumb listesini boğar.
  if (
    breadcrumb.category === "http" &&
    typeof url === "string" &&
    url.includes("/health")
  ) {
    return null;
  }

  const redacted = redactSensitive(breadcrumb) as T;
  if (redacted.data && typeof redacted.data === "object") {
    const data: Record<string, unknown> = { ...redacted.data };
    for (const field of ["url", "http.query"]) {
      const value = data[field];
      if (typeof value === "string") data[field] = redactUrlQuery(value);
    }
    redacted.data = data;
  }
  if (typeof redacted.message === "string") {
    redacted.message = redactUrlQuery(redacted.message);
  }
  return redacted;
}

/** Bir span/trace veri sözlüğündeki her metin değerinde URL query'sini maskeler. */
function redactSpanData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return data;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === "string" ? redactUrlQuery(value) : value,
    ]),
  );
}

/**
 * Performans izlerinin (transaction) geçtiği tek kapı (Sentry.init →
 * beforeSendTransaction); API ve worker AYNI fonksiyonu kullanmalı.
 *
 * Breadcrumb kapısı yetmiyor: aynı fetch entegrasyonu her dış çağrı için bir
 * `http.client` span'ı da üretir ve tam URL'yi span verisine (`url.full`,
 * `http.url`, `http.target`) ve açıklamasına yazar. `tracesSampleRate` sıfır
 * olmadığı sürece bu izler Sentry'ye gider — yani Sürat şifresi breadcrumb'dan
 * silinse bile span üzerinden sızmaya devam ederdi. Anahtar adına güvenmek
 * yerine span'daki HER metin değeri query redaksiyonundan geçirilir.
 */
export function applySentryTransactionPolicy<T extends Event>(
  event: T,
): T | null {
  const base = applySentryEventPolicy(event);
  if (!base) return null;

  if (typeof base.transaction === "string") {
    base.transaction = redactUrlQuery(base.transaction);
  }
  if (base.spans) {
    base.spans = base.spans.map((span) => ({
      ...span,
      description:
        typeof span.description === "string"
          ? redactUrlQuery(span.description)
          : span.description,
      data: redactSpanData(span.data),
    }));
  }
  const trace = base.contexts?.trace;
  if (trace) {
    base.contexts = {
      ...base.contexts,
      trace: { ...trace, data: redactSpanData(trace.data) },
    };
  }
  return base;
}

/**
 * Dağıtım sürümü. Sırayla: açıkça verilen `SENTRY_RELEASE`, Coolify'ın
 * `SOURCE_COMMIT`'i, genel `GIT_COMMIT_SHA`. Hiçbiri yoksa undefined döner ve
 * Sentry kendi tahminine düşer (Docker imajında .git bulunmadığı için
 * genellikle tahmin edemez — o durumda sürüm etiketsiz kalır, akış bozulmaz).
 */
export function resolveSentryRelease(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = env.SENTRY_RELEASE?.trim();
  if (explicit) return explicit;

  const sha = (env.SOURCE_COMMIT ?? env.GIT_COMMIT_SHA)?.trim();
  return sha ? sha.slice(0, 7) : undefined;
}

/**
 * Sentry ortam etiketi. `NODE_ENV`'e bağlanamaz: üç Dockerfile da onu sabit
 * `production` yazar, dolayısıyla staging ile gerçek prod Sentry'de ayırt
 * edilemez ve staging test hataları prod alarmlarına karışırdı. Etiket kendi
 * anahtarından gelir; verilmezse eski davranış (NODE_ENV) korunur.
 */
export function resolveSentryEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV?.trim() || "development"
  );
}

/**
 * Örnekleme oranı için: ETİKETE değil gerçek çalışma kipine bakar. Staging de
 * bir production build'idir; etiketi "staging" diye tam örneklemeye geçilirse
 * iz/profil kotası hızla tükenir.
 */
export function isProductionRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "production";
}
