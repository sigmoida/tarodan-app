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
  // Nötr girdi: alan adlarını client'ın kendisi kurar (bkz.
  // surat-rest-client-mapping.spec.ts). Bu dosya yalnız YANIT yorumlamayı ölçer.
  const shipment = {
    reference: "ref-1",
    sender: {
      name: "Satan Kisi",
      address: "Depo Mah. No:1",
      city: "İstanbul",
      district: "Maltepe",
      phone: "05559876543",
    },
    recipient: {
      name: "Alan Kisi",
      address: "Adres 1",
      city: "İstanbul",
      district: "Kadıköy",
      phone: "05551112233",
    },
  } as any;
  const opts = { timeoutMs: 1000 } as any;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("400 + IsError'suz gövde → THROW (false success DEĞİL)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      text: async () => JSON.stringify({ Message: "Hatalı istek" }),
    }) as any;

    await expect(client.callCreateShipment(shipment, opts)).rejects.toThrow(
      /HTTP 400/,
    );
  });

  it("401 (auth) → THROW", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 401,
      text: async () => "Unauthorized",
    }) as any;

    await expect(client.callCreateShipment(shipment, opts)).rejects.toThrow(
      /HTTP 401/,
    );
  });

  it("200 + IsError:false → 'Tamam' (gerçek başarı korunur)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({ IsError: false, Message: "başarıyla oluşturuldu" }),
    }) as any;

    const res = await client.callCreateShipment(shipment, opts);
    expect(res).toBe("Tamam");
  });

  it("IsError alanı olmayan JSON nesnesini başarı saymaz", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ Message: "Belirsiz cevap" }),
    }) as any;

    await expect(client.callCreateShipment(shipment, opts)).resolves.toBe(
      "Belirsiz cevap",
    );
  });

  it("resmi string cevap sözleşmesini kabul eder", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify("Tamam"),
    }) as any;

    await expect(client.callCreateShipment(shipment, opts)).resolves.toBe(
      "Tamam",
    );
  });

  it("resmi string cevap düz metin dönerse de kabul eder", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => "Tamam",
    }) as any;

    await expect(client.callCreateShipment(shipment, opts)).resolves.toBe(
      "Tamam",
    );
  });

  it("4xx yanıt gövdesini teşhis için hata mesajına ekler", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 404,
      text: async () => JSON.stringify({ Message: "Endpoint bulunamadı" }),
    }) as any;

    await expect(client.callCreateShipment(shipment, opts)).rejects.toThrow(
      /HTTP 404.*Endpoint bulunamadı/,
    );
  });
});
