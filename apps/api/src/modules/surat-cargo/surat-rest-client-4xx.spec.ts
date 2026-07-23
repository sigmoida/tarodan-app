import { RestSuratClient } from "./surat-rest.client";

/**
 * REST 4xx: Sürat REST çağrısında non-2xx yanıt ASLA başarı sayılmamalı. Eski kod
 * yalnız 5xx'i yakalıyordu; IsError içermeyen bir 4xx gövdesi yanlışlıkla "Tamam"
 * (false success) dönebiliyordu → gönderi oluşmadığı halde başarı sanılırdı.
 */
describe("RestSuratClient — 4xx başarı sayılmaz", () => {
  const realFetch = global.fetch;
  const config = {
    get: (k: string, d?: string) =>
      (({ SURAT_KARGO_CARI_KODU: "u", SURAT_KARGO_SIFRE: "p" }) as any)[k] ?? d,
  } as any;
  const client = new RestSuratClient(config);
  const payload = { OzelKargoTakipNo: "ref-1" } as any;
  const opts = { timeoutMs: 1000 } as any;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("400 + IsError'suz gövde → THROW (false success DEĞİL)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      text: async () => JSON.stringify({ Message: "Hatalı istek" }),
    }) as any;

    await expect(
      client.callGonderiyiKargoyaGonderYeni(payload, opts),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("401 (auth) → THROW", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 401,
      text: async () => "Unauthorized",
    }) as any;

    await expect(
      client.callGonderiyiKargoyaGonderYeni(payload, opts),
    ).rejects.toThrow(/HTTP 401/);
  });

  it("200 + IsError:false → 'Tamam' (gerçek başarı korunur)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ IsError: false, Message: "başarıyla oluşturuldu" }),
    }) as any;

    const res = await client.callGonderiyiKargoyaGonderYeni(payload, opts);
    expect(res).toBe("Tamam");
  });
});
