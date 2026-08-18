import { RestSuratClient } from "./surat-rest.client";
import type { SuratCreateShipmentInput } from "../helpers/surat-cargo.types";

/**
 * `RestSuratClient`'ın nötr girdiyi GonderiyiKargoyaGonder alanlarına eşlemesi.
 *
 * Bu eşleme eskiden servis katmanındaydı ve orada test ediliyordu; nötr istemci
 * sözleşmesiyle birlikte buraya indi. Ayrıca daha önce HİÇ pin'lenmemiş üç şeyi
 * de kapsıyor: çağrılan URL, `SURAT_KARGO_TEST_MODE`'un host seçimi ve kimlik
 * eksikken atılan hata. Bunlar test edilmediği için "gönderi oluştu" sanılırken
 * yanlış hosta gitme ihtimali sessizdi.
 */

const shipment: SuratCreateShipmentInput = {
  reference: "PKG-42",
  sender: {
    name: "Satan Kisi",
    address: "Depo Mah. Sevk Cad. No:1",
    city: "İstanbul",
    district: "Maltepe",
    phone: "05559876543",
  },
  recipient: {
    name: "  Ayşe Kaya  ",
    address: "Adres 1",
    city: " İstanbul ",
    district: " Kadıköy ",
    phone: "+90 555 111 22 33",
  },
  content: "Ürün",
  desi: 4,
  isReturn: true,
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
  return new RestSuratClient(config as never);
}

function mockFetchOk() {
  const fetchMock = jest.fn().mockResolvedValue({
    status: 200,
    text: async () => "Tamam",
  });
  global.fetch = fetchMock as never;
  return fetchMock;
}

function sentBody(fetchMock: jest.Mock) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("RestSuratClient — neutral input to GonderiyiKargoyaGonder fields", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("normalizes the recipient and carries our reference as OzelKargoTakipNo", async () => {
    const fetchMock = mockFetchOk();

    await expect(
      buildClient().callCreateShipment(shipment, { timeoutMs: 1000 }),
    ).resolves.toBe("Tamam");

    expect(sentBody(fetchMock).Gonderi).toEqual(
      expect.objectContaining({
        OzelKargoTakipNo: "PKG-42",
        KisiKurum: "Ayşe Kaya",
        Il: "İstanbul",
        Ilce: "Kadıköy",
        TelefonCep: "05551112233",
        BirimDesi: "4",
        Iademi: 1,
      }),
    );
  });

  it("drops the sender — this contract has no field for it", async () => {
    const fetchMock = mockFetchOk();

    await buildClient().callCreateShipment(shipment, { timeoutMs: 1000 });

    // Gönderici bu uçta ifade EDİLEMEZ: gönderi Sürat'ta kurumsal cari
    // hesabımızın üstüne açılır. Pazaryeri gönderisinin GonderiOlustur'a
    // taşınmasının nedeni tam olarak bu satırdır.
    const body = sentBody(fetchMock);
    expect(JSON.stringify(body)).not.toContain("Satan Kisi");
    expect(JSON.stringify(body)).not.toContain("05559876543");
  });

  it("sends credentials from config in the request envelope", async () => {
    const fetchMock = mockFetchOk();

    await buildClient().callCreateShipment(shipment, { timeoutMs: 1000 });

    expect(sentBody(fetchMock)).toMatchObject({
      KullaniciAdi: "cari",
      Sifre: "sifre",
    });
  });

  it("targets the api02 test host by default", async () => {
    const fetchMock = mockFetchOk();

    await buildClient().callCreateShipment(shipment, { timeoutMs: 1000 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api02.suratkargo.com.tr/api/GonderiyiKargoyaGonder",
    );
  });

  it("targets the api01 live host only when test mode is explicitly false", async () => {
    const fetchMock = mockFetchOk();

    await buildClient({ SURAT_KARGO_TEST_MODE: "false" }).callCreateShipment(
      shipment,
      { timeoutMs: 1000 },
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api01.suratkargo.com.tr/api/GonderiyiKargoyaGonder",
    );
  });

  it("throws before any network call when credentials are missing", async () => {
    const fetchMock = mockFetchOk();
    const client = buildClient({
      SURAT_KARGO_CARI_KODU: "",
      SURAT_KARGO_SIFRE: "",
    });

    await expect(
      client.callCreateShipment(shipment, { timeoutMs: 1000 }),
    ).rejects.toThrow(/SURAT_KARGO_CARI_KODU|SURAT_KARGO_SIFRE/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
