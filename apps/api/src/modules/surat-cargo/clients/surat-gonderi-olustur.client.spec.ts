import { GonderiOlusturClient } from "./surat-gonderi-olustur.client";
import type { SuratCreateShipmentInput } from "../helpers/surat-cargo.types";

/**
 * v2 istemcisinin ağ sözleşmesi: doğru yol, doğru host, zorunlu `FirmaId` ve
 * TEK elemanlı `Data` dizisi. Yol ya da host yanlış olsaydı hiçbir test bunu
 * yakalamazdı — gönderi "başarılı" görünüp canlı yerine teste düşebilirdi.
 */

const shipment: SuratCreateShipmentInput = {
  reference: "PKG-42",
  sender: {
    name: "Mehmet Satıcı",
    address: "Depo Mah. No:1",
    city: "İstanbul",
    district: "Maltepe",
    phone: "05559876543",
  },
  recipient: {
    name: "Ayşe Kaya",
    address: "Atatürk Cad. No:5",
    city: "Ankara",
    district: "Çankaya",
    phone: "05551112233",
  },
  desi: 4,
};

function buildClient(env: Record<string, string> = {}) {
  const config = {
    get: (key: string, fallback?: string) =>
      ({
        SURAT_KARGO_CARI_KODU: "cari",
        SURAT_KARGO_SIFRE: "sifre",
        ...env,
      })[key] ?? fallback,
  };
  return new GonderiOlusturClient(config as never);
}

function mockFetchOk() {
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ status: 200, text: async () => "Tamam" });
  global.fetch = fetchMock as never;
  return fetchMock;
}

const sentBody = (fetchMock: jest.Mock) =>
  JSON.parse(fetchMock.mock.calls[0][1].body);

describe("GonderiOlusturClient", () => {
  const realFetch = global.fetch;
  const savedFirmaId = process.env.SURAT_FIRMA_ID;

  beforeEach(() => {
    process.env.SURAT_FIRMA_ID = "77";
  });

  afterEach(() => {
    global.fetch = realFetch;
    if (savedFirmaId === undefined) delete process.env.SURAT_FIRMA_ID;
    else process.env.SURAT_FIRMA_ID = savedFirmaId;
  });

  it("posts a single-element Data array with credentials and FirmaId", async () => {
    const fetchMock = mockFetchOk();

    await expect(
      buildClient().callCreateShipment(shipment, { timeoutMs: 1000 }),
    ).resolves.toBe("Tamam");

    const body = sentBody(fetchMock);
    expect(body).toMatchObject({
      KullaniciAdi: "cari",
      Sifre: "sifre",
      FirmaId: 77,
    });
    // Tek eleman: yanıt tek string olduğu için çok elemanlı dizide hangi
    // gönderinin patladığı ayrıştırılamaz.
    expect(body.Data).toHaveLength(1);
    expect(body.Data[0]).toMatchObject({
      SatisKodu: "PKG-42",
      Desi: 4,
      Gonderen: expect.objectContaining({ IlId: 34 }),
      Alici: expect.objectContaining({ IlId: 6 }),
    });
  });

  it("targets the api02 test host by default", async () => {
    const fetchMock = mockFetchOk();

    await buildClient().callCreateShipment(shipment, { timeoutMs: 1000 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api02.suratkargo.com.tr/api/GonderiOlustur",
    );
  });

  it("targets the api01 live host only when test mode is explicitly false", async () => {
    const fetchMock = mockFetchOk();

    await buildClient({ SURAT_KARGO_TEST_MODE: "false" }).callCreateShipment(
      shipment,
      { timeoutMs: 1000 },
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api01.suratkargo.com.tr/api/GonderiOlustur",
    );
  });

  it("throws before any network call when FirmaId is missing", async () => {
    delete process.env.SURAT_FIRMA_ID;
    const fetchMock = mockFetchOk();

    // Ağa çıkılsaydı her çağrı kimlik hatasıyla dönerdi ve retry bunu teknik
    // hata sanıp üç kez denerdi.
    await expect(
      buildClient().callCreateShipment(shipment, { timeoutMs: 1000 }),
    ).rejects.toThrow(/SURAT_FIRMA_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws before any network call when credentials are missing", async () => {
    const fetchMock = mockFetchOk();

    await expect(
      buildClient({
        SURAT_KARGO_CARI_KODU: "",
        SURAT_KARGO_SIFRE: "",
      }).callCreateShipment(shipment, { timeoutMs: 1000 }),
    ).rejects.toThrow(/SURAT_KARGO_CARI_KODU|SURAT_KARGO_SIFRE/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on an unmappable address without calling the carrier", async () => {
    const fetchMock = mockFetchOk();

    await expect(
      buildClient().callCreateShipment(
        {
          ...shipment,
          recipient: { ...shipment.recipient, city: "Berlin" },
        },
        { timeoutMs: 1000 },
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares the response contract with v1 — a 4xx is never a success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      text: async () => JSON.stringify({ Message: "Hatalı istek" }),
    }) as never;

    await expect(
      buildClient().callCreateShipment(shipment, { timeoutMs: 1000 }),
    ).rejects.toThrow(/HTTP 400/);
  });
});
