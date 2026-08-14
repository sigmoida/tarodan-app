import { resolveSuratCarrierClient } from "../surat-cargo.module";
import { RestSuratClient } from "./surat-rest.client";
import { StubSuratSoapClient } from "./surat-soap.client";

/**
 * Stub fail-fast: production'da kargo AÇIKken SURAT_SOAP_MODE gerçek bir taşıyıcı
 * moduna ayarlı değilse boot patlar (aksi halde stub sahte kargo başarısı üretir).
 */
describe("resolveSuratCarrierClient — stub fail-fast + mode seçimi", () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string, def?: string) => env[key] ?? def,
    }) as any;

  it("production + cargo AÇIK + mode 'stub' → FATAL (boot patlar)", () => {
    const config = makeConfig({
      NODE_ENV: "production",
      SURAT_CARGO_ENABLED: "true",
      SURAT_SOAP_MODE: "stub",
    });
    expect(() => resolveSuratCarrierClient(config)).toThrow(/FATAL/);
  });

  it("production + cargo AÇIK + mode UNSET (default stub) → FATAL", () => {
    const config = makeConfig({
      NODE_ENV: "production",
      SURAT_CARGO_ENABLED: "1",
      // SURAT_SOAP_MODE yok → default 'stub'
    });
    expect(() => resolveSuratCarrierClient(config)).toThrow(/FATAL/);
  });

  it("production + cargo AÇIK + mode 'rest' → RestSuratClient (patlamaz)", () => {
    const config = makeConfig({
      NODE_ENV: "production",
      SURAT_CARGO_ENABLED: "true",
      SURAT_SOAP_MODE: "rest",
    });
    expect(resolveSuratCarrierClient(config)).toBeInstanceOf(RestSuratClient);
  });

  it("production ama cargo KAPALI + mode stub → stub'a izin ver (entegrasyon yok)", () => {
    const config = makeConfig({
      NODE_ENV: "production",
      SURAT_CARGO_ENABLED: "false",
      SURAT_SOAP_MODE: "stub",
    });
    expect(resolveSuratCarrierClient(config)).toBeInstanceOf(
      StubSuratSoapClient,
    );
  });

  it("non-production + cargo AÇIK + stub → izin ver (dev/test)", () => {
    const config = makeConfig({
      NODE_ENV: "development",
      SURAT_CARGO_ENABLED: "true",
      SURAT_SOAP_MODE: "stub",
    });
    expect(resolveSuratCarrierClient(config)).toBeInstanceOf(
      StubSuratSoapClient,
    );
  });

  it.each(["live", "soap"])(
    "mode '%s' → reddedilir; yalnız belgeli REST akışı desteklenir",
    (mode) => {
      const config = makeConfig({ SURAT_SOAP_MODE: mode });
      expect(() => resolveSuratCarrierClient(config)).toThrow(
        /yalnız resmi REST/,
      );
    },
  );
});
