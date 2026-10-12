import { isPdfBuffer } from "../helpers/invoice-pdf";
import {
  buildFiscalDocumentFixture,
  buildFiscalInvoicePdfInputFixture,
  buildReturnPdfInputFixture,
} from "./fiscal-invoice-pdf.fixture";
import { buildFiscalInvoicePdfModel } from "./fiscal-invoice-pdf.model";
import { renderFiscalInvoicePdf } from "./fiscal-invoice-pdf.renderer";

/** pdfkit gömülü TTF'yi glif kimliğiyle yazar — metin aranamaz; sayfa nesneleri sayılır. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("renderFiscalInvoicePdf", () => {
  it("satış belgesini geçerli bir PDF olarak basar", async () => {
    const pdf = await renderFiscalInvoicePdf(
      buildFiscalInvoicePdfInputFixture(),
    );

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(isPdfBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pageCount(pdf)).toBeGreaterThan(0);
  });

  it("iade belgesini basar", async () => {
    const pdf = await renderFiscalInvoicePdf(buildReturnPdfInputFixture());

    expect(isPdfBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pageCount(pdf)).toBeGreaterThan(0);
  });

  it("e-Fatura senaryosunu ve İngilizce etiketleri basar", async () => {
    const pdf = await renderFiscalInvoicePdf(
      buildFiscalInvoicePdfInputFixture({
        document: buildFiscalDocumentFixture({ scenario: "EINVOICE" }),
        locale: "en",
      }),
    );

    expect(isPdfBuffer(pdf)).toBe(true);
  });

  it("numarasız (entegratör atayacak) belgeyi ve opsiyonel bloklar olmadan basar", async () => {
    const pdf = await renderFiscalInvoicePdf(
      buildFiscalInvoicePdfInputFixture({
        document: buildFiscalDocumentFixture({
          documentNumber: undefined,
          note: undefined,
        }),
        verification: undefined,
        qrPayload: undefined,
      }),
    );

    expect(isPdfBuffer(pdf)).toBe(true);
  });

  it("çok kalemli belge birden fazla sayfaya taşar", async () => {
    const base = buildFiscalDocumentFixture();
    const lines = Array.from({ length: 80 }, (_, i) => ({
      name: `Kalem ${i + 1}`,
      description: "Sipariş No: PKG-10001",
      quantity: 1,
      unitPrice: 10,
      lineExtension: 10,
      vatRate: 20,
    }));
    const single = await renderFiscalInvoicePdf(
      buildFiscalInvoicePdfInputFixture(),
    );
    const multi = await renderFiscalInvoicePdf(
      buildFiscalInvoicePdfInputFixture({
        document: { ...base, lines },
      }),
    );

    expect(pageCount(multi)).toBeGreaterThan(pageCount(single));
  });
});

describe("buildFiscalInvoicePdfModel", () => {
  it("satış belgesinde künye, taraflar ve tutarlar Türkçe basılır", () => {
    const model = buildFiscalInvoicePdfModel(
      buildFiscalInvoicePdfInputFixture(),
    );
    const meta = Object.fromEntries(model.meta.map((m) => [m.label, m.value]));

    expect(model.title).toBe("e-Arşiv Fatura");
    expect(model.returnMarker).toBeUndefined();
    expect(meta["Fatura No"]).toBe("TRD2026000000001");
    expect(meta["ETTN"]).toBe("7f9c2f0e-4a1b-4c55-9d3e-2b6a8c1d0e11");
    expect(meta["Düzenlenme Tarihi"]).toBe("12.10.2026 14:35:20");
    expect(meta["Referans"]).toBe("KYT-10001");
    // Ham enum değil, yerelleştirilmiş etiket.
    expect(meta["Durum"]).toBe("Gönderildi");
    // Oluşturulma: dd.mm.yyyy HH:mm, İstanbul saati (11:35Z -> 14:35).
    expect(model.footer.generatedAt).toBe("Oluşturulma: 12.10.2026 14:35");
    expect(model.issuer.name).toBe("Tarodan Pazaryeri A.Ş.");
    expect(model.issuer.details).toContainEqual({
      label: "VKN",
      value: "1234567890",
    });
    // 11 haneli kimlik TCKN etiketiyle basılır.
    expect(model.recipient.name).toBe("Çağrı Öztürk");
    expect(model.recipient.details[0]).toEqual({
      label: "TCKN",
      value: "11111111110",
    });
    expect(model.verification?.text).toContain("https://sorgu.example.com");
    expect(model.footer.legal).toBe(
      "Bu belge, GİB'e iletilen e-belgenin görsel kopyasıdır; mali geçerliliği e-belgededir.",
    );
  });

  it("toplamlar oran bazında ve tr-TR biçiminde yazılır", () => {
    const model = buildFiscalInvoicePdfModel(
      buildFiscalInvoicePdfInputFixture(),
    );
    const totals = Object.fromEntries(model.totals.map((t) => [t.label, t.value]));

    expect(totals["Mal/Hizmet Tutarı (KDV Hariç)"]).toBe("140,00 TL");
    expect(totals["Toplam İskonto"]).toBe("10,00 TL");
    expect(totals["KDV (%10)"]).toBe("5,00 TL");
    expect(totals["KDV (%20)"]).toBe("18,00 TL");
    expect(totals["Ödenecek Tutar"]).toBe("163,00 TL");
  });

  it("iade belgesinde İADE işareti ve orijinal belge referansı bulunur", () => {
    const model = buildFiscalInvoicePdfModel(buildReturnPdfInputFixture());

    expect(model.returnMarker).toBe("İADE");
    expect(model.billingReference?.text).toContain("TRD2026000000001");
    expect(model.billingReference?.text).toContain("12.10.2026");
  });

  it.each([
    ["pending", "Beklemede", "Pending"],
    ["processing", "Gönderiliyor", "Sending"],
    ["sent", "Gönderildi", "Sent"],
    ["signed", "İmzalandı", "Signed"],
    ["failed", "Başarısız", "Failed"],
    ["cancelled", "İptal edildi", "Cancelled"],
  ])("durum '%s' tr/en etiketiyle basılır", (status, tr, en) => {
    const statusOf = (locale: "tr" | "en") =>
      buildFiscalInvoicePdfModel(
        buildFiscalInvoicePdfInputFixture({ status, locale }),
      ).meta.find((m) => m.label === (locale === "tr" ? "Durum" : "Status"))
        ?.value;

    expect(statusOf("tr")).toBe(tr);
    expect(statusOf("en")).toBe(en);
  });

  it("bilinmeyen durum ham değerle basılır", () => {
    const model = buildFiscalInvoicePdfModel(
      buildFiscalInvoicePdfInputFixture({ status: "mystery" }),
    );

    expect(model.meta.find((m) => m.label === "Durum")?.value).toBe("mystery");
  });

  it("numara henüz atanmadıysa künyede açıklama basar", () => {
    const model = buildFiscalInvoicePdfModel(
      buildFiscalInvoicePdfInputFixture({
        document: buildFiscalDocumentFixture({ documentNumber: undefined }),
      }),
    );

    expect(model.meta[0].value).toBe("Entegratör tarafından atanacak");
  });

  it("İngilizce etiketleri katalogdan çözer", () => {
    const model = buildFiscalInvoicePdfModel(
      buildFiscalInvoicePdfInputFixture({
        document: buildFiscalDocumentFixture({ scenario: "EINVOICE" }),
        locale: "en",
      }),
    );

    expect(model.title).toBe("e-Invoice");
    expect(model.columns.description).toBe("Description");
    expect(model.footer.legal).toContain("visual copy");
    expect(model.pageLabel(1, 2)).toBe("Page 1 / 2");
  });
});
