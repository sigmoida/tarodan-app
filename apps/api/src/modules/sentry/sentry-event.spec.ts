import {
  applySentryEventPolicy,
  isProductionRuntime,
  resolveSentryEnvironment,
  resolveSentryRelease,
} from "./sentry-event";
import { runWithRequestId } from "../../common/context/request-context";

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
