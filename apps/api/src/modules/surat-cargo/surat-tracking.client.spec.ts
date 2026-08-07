import { SuratTrackingClient } from "./surat-tracking.client";

describe("SuratTrackingClient.lookupTracking", () => {
  const originalFetch = global.fetch;

  const makeClient = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      SURAT_KARGO_CARI_KODU: "1361590662",
      SURAT_KARGO_SIFRE: "secret",
      SURAT_KARGO_TEST_MODE: "true",
      SURAT_TRACKING_TIMEOUT_MS: "20000",
      ...overrides,
    };
    const config = {
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    };
    return new SuratTrackingClient(config as any);
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("treats branch-acceptance waiting as pending and sends an empty POST body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          IsError: true,
          errorMessage: "Veri aktarımı sağlanmış olup kargo kabul bekleniyor.",
          Gonderiler: [],
        }),
      ),
    }) as any;
    const client = makeClient();

    await expect(client.lookupTracking("PKG-TEST")).resolves.toEqual({
      kind: "pending",
      message: "Veri aktarımı sağlanmış olup kargo kabul bekleniyor.",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("WebSiparisKodu=PKG-TEST"),
      expect.objectContaining({ method: "POST", body: "" }),
    );
  });

  it("returns the real carrier code when Sürat exposes a shipment", async () => {
    const response = {
      IsError: false,
      errorMessage: null,
      Gonderiler: [{ KargoTakipNo: "SURAT-123", Hareketler: [] }],
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify(response)),
    }) as any;

    await expect(makeClient().lookupTracking("PKG-TEST")).resolves.toEqual({
      kind: "found",
      data: response,
    });
  });

  it("keeps provider authorization errors separate from pending records", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          IsError: true,
          errorMessage: "Bu metodu kullanma yetkiniz bulunmamaktadır.",
          Gonderiler: [],
        }),
      ),
    }) as any;

    await expect(makeClient().lookupTracking("PKG-TEST")).resolves.toEqual({
      kind: "failure",
      category: "provider",
      message: "Bu metodu kullanma yetkiniz bulunmamaktadır.",
    });
  });

  it("classifies AbortError as timeout", async () => {
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    global.fetch = jest.fn().mockRejectedValue(abortError) as any;

    await expect(makeClient().lookupTracking("PKG-TEST")).resolves.toEqual({
      kind: "failure",
      category: "timeout",
      message: "Surat tracking API timed out after 20000ms for PKG-TEST",
    });
  });
});
