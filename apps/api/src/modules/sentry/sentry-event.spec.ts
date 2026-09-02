import {
  applySentryBreadcrumbPolicy,
  applySentryEventPolicy,
  applySentryTransactionPolicy,
  isProductionRuntime,
  resolveSentryEnvironment,
  resolveSentryRelease,
} from "./sentry-event";
import { runWithRequestId } from "../../common/context/request-context";

/**
 * Breadcrumb kapısı: Sentry'nin fetch entegrasyonu her dış çağrının URL'ini
 * kaydeder; Sürat sözleşmesi kimliği query'de taşır. Canlıda şifre Sentry
 * olaylarında düz metin göründü — bu testler o sızıntıyı kapalı tutar.
 */
describe("applySentryBreadcrumbPolicy", () => {
  const suratUrl =
    "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi?CariKodu=1561604773&Sifre=S3CR3T&WebSiparisKodu=PKG-2HGNFGEGTD";

  it("masks carrier credentials in outbound http breadcrumbs, keeps the reference", () => {
    const crumb = applySentryBreadcrumbPolicy({
      category: "http",
      data: {
        url: suratUrl,
        "http.query":
          "?CariKodu=1561604773&Sifre=S3CR3T&WebSiparisKodu=PKG-2HGNFGEGTD",
        method: "POST",
      },
    } as any);
    const serialized = JSON.stringify(crumb);
    expect(serialized).not.toContain("S3CR3T");
    expect(serialized).not.toContain("1561604773");
    expect(crumb?.data?.url).toContain("Sifre=***");
    expect(crumb?.data?.url).toContain("CariKodu=***");
    expect(crumb?.data?.url).toContain("WebSiparisKodu=PKG-2HGNFGEGTD");
    expect(crumb?.data?.["http.query"]).toContain("Sifre=***");
    expect(crumb?.data?.method).toBe("POST");
  });

  it("drops health-check breadcrumbs", () => {
    expect(
      applySentryBreadcrumbPolicy({
        category: "http",
        data: { url: "https://api/x/health" },
      } as any),
    ).toBeNull();
  });

  it("still redacts sensitive keys in breadcrumb data and masks urls in messages", () => {
    const crumb = applySentryBreadcrumbPolicy({
      category: "console",
      message: `Surat tracking API request failed for ${suratUrl}`,
      data: { password: "hunter2" },
    } as any);
    expect(JSON.stringify(crumb)).not.toContain("hunter2");
    expect(crumb?.message).not.toContain("S3CR3T");
    expect(crumb?.message).toContain("Sifre=***");
  });

  it("passes breadcrumbs without data through untouched", () => {
    const crumb = { category: "navigation", message: "x" } as any;
    expect(applySentryBreadcrumbPolicy(crumb)).toEqual(crumb);
  });
});

/**
 * Performans izleri: fetch entegrasyonu her dış çağrı için `http.client` span'ı
 * üretir ve tam URL'yi span verisine yazar. Breadcrumb temizlense de span
 * üzerinden sızardı — bu kapı onu kapatır.
 */
describe("applySentryTransactionPolicy", () => {
  const suratUrl =
    "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi?CariKodu=1561604773&Sifre=S3CR3T&WebSiparisKodu=PKG-2HGNFGEGTD";

  it("masks credentials in outbound http spans, span descriptions and the trace context", () => {
    const tx = applySentryTransactionPolicy({
      type: "transaction",
      transaction: "cron sync-surat-tracking",
      contexts: {
        trace: {
          trace_id: "t",
          span_id: "s",
          op: "queue.process",
          data: { "url.full": suratUrl },
        },
      },
      spans: [
        {
          span_id: "s1",
          trace_id: "t",
          start_timestamp: 1,
          op: "http.client",
          description: `POST ${suratUrl}`,
          data: {
            "url.full": suratUrl,
            "http.url": suratUrl,
            "http.target":
              "/api/KargoTakipHareketDetayi?CariKodu=1561604773&Sifre=S3CR3T",
            "http.request.method": "POST",
            "http.response.status_code": 200,
          },
        },
      ],
    } as any);

    const serialized = JSON.stringify(tx);
    expect(serialized).not.toContain("S3CR3T");
    expect(serialized).not.toContain("1561604773");
    expect(tx?.spans?.[0]?.description).toContain("Sifre=***");
    expect(tx?.spans?.[0]?.data?.["url.full"]).toContain(
      "WebSiparisKodu=PKG-2HGNFGEGTD",
    );
    expect(tx?.spans?.[0]?.data?.["http.response.status_code"]).toBe(200);
    expect(tx?.contexts?.trace?.data?.["url.full"]).toContain("Sifre=***");
    expect(tx?.transaction).toBe("cron sync-surat-tracking");
  });

  it("drops health-check transactions and keeps ordinary ones", () => {
    expect(
      applySentryTransactionPolicy({
        type: "transaction",
        request: { url: "https://api/x/health" },
      } as any),
    ).toBeNull();
    const plain = { type: "transaction", transaction: "GET /orders" } as any;
    expect(applySentryTransactionPolicy(plain)).toMatchObject(plain);
  });
});

/**
 * Sentry'ye giden her olayın geçtiği TEK kapı. Üç sözleşme:
 *  - sağlık kontrolleri hiç gitmez (dakikada bir koşan gürültü),
 *  - hassas alanlar redakte edilir (gövde/başlık sızıntısı olmaz),
 *  - korelasyon kimliği TAG olur — `extra` aranabilir değildir, oysa asıl
 *    senaryo kullanıcının verdiği kodu Sentry aramasına yazmaktır.
 */
describe("applySentryEventPolicy", () => {
  it("sağlık kontrolü olaylarını düşürür", () => {
    const event = { request: { url: "https://api/x/health" } } as any;
    expect(applySentryEventPolicy(event)).toBeNull();
  });

  it("korelasyon kimliğini ARANABİLİR tag olarak ekler", () => {
    const event = runWithRequestId("req-abc", () =>
      applySentryEventPolicy({ message: "boom" } as any),
    );
    expect(event?.tags).toMatchObject({ requestId: "req-abc" });
  });

  it("istek bağlamı dışında (cron/worker) tag eklemez", () => {
    const event = applySentryEventPolicy({ message: "cron" } as any);
    expect(event?.tags?.requestId).toBeUndefined();
  });

  it("mevcut tag'leri korur", () => {
    const event = runWithRequestId("req-1", () =>
      applySentryEventPolicy({ tags: { area: "payment" } } as any),
    );
    expect(event?.tags).toMatchObject({ area: "payment", requestId: "req-1" });
  });

  it("hassas alanları redakte eder", () => {
    const event = applySentryEventPolicy({
      request: { url: "https://api/login", data: { password: "hunter2" } },
    } as any);
    expect(JSON.stringify(event)).not.toContain("hunter2");
  });
});

/**
 * Sürüm etiketi olmadan "bu hata hangi deploy'la geldi" sorusu cevapsız kalır;
 * Sentry'nin regresyon takibi (çözülen bir issue yeni sürümde tekrar açılırsa
 * uyarma) da sürüme dayanır.
 */
describe("resolveSentryRelease", () => {
  it("açık SENTRY_RELEASE her şeyin önündedir", () => {
    expect(
      resolveSentryRelease({
        SENTRY_RELEASE: "v1.2.3",
        SOURCE_COMMIT: "abcdef1234567890",
      }),
    ).toBe("v1.2.3");
  });

  it("Coolify'ın SOURCE_COMMIT'ini kısa sha'ya indirger", () => {
    expect(resolveSentryRelease({ SOURCE_COMMIT: "abcdef1234567890" })).toBe(
      "abcdef1",
    );
  });

  it("GIT_COMMIT_SHA da kabul edilir", () => {
    expect(resolveSentryRelease({ GIT_COMMIT_SHA: "1234567abcdef" })).toBe(
      "1234567",
    );
  });

  it("hiçbiri yoksa undefined döner (Sentry kendi tahminine düşer)", () => {
    expect(resolveSentryRelease({})).toBeUndefined();
  });
});

/**
 * Ortam etiketi `NODE_ENV`'e bağlanamaz: her üç Dockerfile da onu sabit
 * `production` yazar, yani staging ve gerçek prod Sentry'de AYNI görünürdü —
 * staging'deki test hataları prod alarmlarının arasına karışırdı. Etiket
 * kendi anahtarından (SENTRY_ENVIRONMENT) gelir.
 */
describe("resolveSentryEnvironment", () => {
  it("SENTRY_ENVIRONMENT ortamı belirler (NODE_ENV production olsa bile)", () => {
    expect(
      resolveSentryEnvironment({
        SENTRY_ENVIRONMENT: "staging",
        NODE_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("verilmezse NODE_ENV'e düşer (tek ortamlı kurulum bozulmaz)", () => {
    expect(resolveSentryEnvironment({ NODE_ENV: "production" })).toBe(
      "production",
    );
  });

  it("hiçbiri yoksa development varsayar", () => {
    expect(resolveSentryEnvironment({})).toBe("development");
  });
});

/**
 * Örnekleme oranı ETİKETE değil gerçek çalışma kipine (NODE_ENV) bakar:
 * staging de production build'idir ve etiketi "staging" olduğu için tam
 * örneklemeye düşerse ücretsiz kota hızla tükenirdi.
 */
describe("isProductionRuntime", () => {
  it("staging etiketi tam örneklemeyi AÇMAZ", () => {
    expect(
      isProductionRuntime({
        SENTRY_ENVIRONMENT: "staging",
        NODE_ENV: "production",
      }),
    ).toBe(true);
  });

  it("yerel geliştirmede false", () => {
    expect(isProductionRuntime({ NODE_ENV: "development" })).toBe(false);
  });
});
