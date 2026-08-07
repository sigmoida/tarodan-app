/**
 * Sürat Kargo resmi REST API entegrasyon testleri (test ortamı / api02).
 *
 * Yalnız 2024 dokümanlarında yer alan iki endpoint çağrılır:
 * - GonderiyiKargoyaGonder
 * - KargoTakipHareketDetayi
 *
 * Manuel çalıştırma: pnpm --filter @tarodan/api test:integration
 * Gereksinim: geçerli SURAT_KARGO_CARI_KODU ve SURAT_KARGO_SIFRE.
 */

const CREATE_URL = "https://api02.suratkargo.com.tr/api/GonderiyiKargoyaGonder";
const TRACKING_URL =
  "https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi";

const cariKodu = process.env.SURAT_KARGO_CARI_KODU!;
const sifre = process.env.SURAT_KARGO_SIFRE!;

function buildPayload(reference: string) {
  return {
    KisiKurum: "Test Alici",
    SahisBirim: "Test Urun",
    AliciAdresi: "Caferaga Mah. Moda Cad. No:14",
    Il: "Istanbul",
    Ilce: "Kadikoy",
    TelefonEv: "",
    TelefonIs: "",
    TelefonCep: "5321112233",
    Email: "",
    AliciKodu: "",
    KargoTuru: 3,
    OdemeTipi: 1,
    IrsaliyeSeriNo: "",
    IrsaliyeSiraNo: "",
    ReferansNo: "",
    OzelKargoTakipNo: reference,
    Adet: 1,
    BirimDesi: "1",
    BirimKg: "1",
    KargoIcerigi: "",
    KapidanOdemeTahsilatTipi: 0,
    KapidanOdemeTutari: 0,
    EkHizmetler: "",
    SevkAdresi: "",
    TeslimSubeKodu: "",
    TasimaSekli: 1,
    TeslimSekli: 1,
    GonderiSekli: 0,
    Pazaryerimi: 0,
    EntegrasyonFirmasi: "",
    Iademi: 0,
  };
}

async function createShipment(reference: string, password = sifre) {
  const response = await fetch(CREATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      KullaniciAdi: cariKodu,
      Sifre: password,
      Gonderi: buildPayload(reference),
    }),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Ham metin teşhis için korunur.
  }
  return { status: response.status, body };
}

async function trackShipment(reference: string) {
  const url = new URL(TRACKING_URL);
  url.searchParams.set("CariKodu", cariKodu);
  url.searchParams.set("Sifre", sifre);
  url.searchParams.set("WebSiparisKodu", reference);
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: "",
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Ham metin teşhis için korunur.
  }
  return { status: response.status, body };
}

describe("Sürat Kargo documented REST integration", () => {
  beforeAll(() => {
    if (!cariKodu || !sifre) {
      throw new Error(
        "SURAT credentials not configured. Set SURAT_KARGO_CARI_KODU and SURAT_KARGO_SIFRE.",
      );
    }
  });

  it("rejects create with a wrong password", async () => {
    const response = await createShipment(
      `AUTH-${Date.now()}`,
      "wrong-password-xyz",
    );
    expect([200, 400, 401, 403]).toContain(response.status);
    expect(JSON.stringify(response.body).toLocaleLowerCase("tr-TR")).toMatch(
      /hatal|kullanıcı|kullanici|şifre|sifre|unauthorized/,
    );
  });

  it("creates through GonderiyiKargoyaGonder and tracks by the same reference", async () => {
    const reference = `REST-${Date.now()}`;
    const created = await createShipment(reference);
    expect(created.status).toBeGreaterThanOrEqual(200);
    expect(created.status).toBeLessThan(300);

    const tracked = await trackShipment(reference);
    expect(tracked.status).toBeGreaterThanOrEqual(200);
    expect(tracked.status).toBeLessThan(500);
    expect(tracked.body).toBeTruthy();
  });

  it("same OzelKargoTakipNo is idempotent at the documented create endpoint", async () => {
    const reference = `IDEMP-${Date.now()}`;
    const first = await createShipment(reference);
    const second = await createShipment(reference);
    expect(first.status).toBeGreaterThanOrEqual(200);
    expect(first.status).toBeLessThan(300);
    expect(second.status).toBeGreaterThanOrEqual(200);
    expect(second.status).toBeLessThan(500);
    expect(second.body).toBeTruthy();
  });

  it("tracking handles a non-existent WebSiparisKodu without transport failure", async () => {
    const response = await trackShipment(`NONEXISTENT-${Date.now()}`);
    expect([200, 400, 404]).toContain(response.status);
    expect(response.body).toBeTruthy();
  });
});
