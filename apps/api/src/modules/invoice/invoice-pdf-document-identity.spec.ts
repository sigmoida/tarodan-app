import { InvoicePdfService } from "./invoice-pdf.service";

/**
 * Bilgilendirme PDF'i kendini RESMÎ FATURA olarak sunmamalı.
 *
 * Bu modülün ürettiği belge mali belge değildir — resmî gelir belgeleri eLogo
 * e-Arşiv/e-Fatura olarak kesilir, pazaryeri ÜRÜN faturası ise kurumsal
 * satıcının yükleme akışındadır. Buna rağmen belge "FATURA" başlığı taşıyor,
 * altbilgisi "mali değeri vardır" diyor ve numarası resmî eLogo belgeleriyle
 * aynı "TRD" önekini kullanıyordu: bireysel (mükellef olmayan) satıcının
 * siparişinde alıcıya fatura görünümlü belge, platform satışında ise aynı
 * sipariş için iki farklı "FATURA" numarası üretilebiliyordu.
 */
describe("InvoicePdfService — belge kimliği (sipariş özeti, fatura değil)", () => {
  const service = new InvoicePdfService(
    {} as any,
    { get: jest.fn() } as any,
    {} as any,
  );

  const data = {
    invoiceNumber: "SPR-202607-000001",
    invoiceDate: new Date("2026-07-30T00:00:00Z"),
    orderNumber: "ORD-TEST1",
    currency: "TRY",
    seller: { name: "Satıcı Adı", email: "satici@ornek.com" },
    buyer: { name: "Alıcı Adı", email: "alici@ornek.com" },
    items: [
      { description: "Model araba", quantity: 1, unitPrice: 100, total: 100 },
    ],
    subtotal: 100,
    shippingCost: 0,
    commission: 0,
    taxAmount: 0,
    taxRate: 0,
    total: 100,
    paymentMethod: "Kart",
  } as any;

  it("HTML belge 'SİPARİŞ ÖZETİ' başlığı taşır, kendine fatura demez", () => {
    const html = service.generateInvoiceHtml(data);

    expect(html).toContain("SİPARİŞ ÖZETİ");
    expect(html).not.toMatch(/FATURA/);
    expect(html).not.toContain("Bu fatura elektronik olarak oluşturulmuştur");
  });

  it("HTML belge mali belge olmadığını açıkça söyler", () => {
    const html = service.generateInvoiceHtml(data);

    expect(html).toContain("mali belge (fatura) niteliği taşımaz");
  });

  it("belge numarası resmî eLogo önekini (TRD) taklit etmez", async () => {
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new InvoicePdfService(
      prisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    const number = await svc.generateInvoiceNumber();

    expect(number).toMatch(/^SPR-\d{6}-\d{6}$/);
    expect(number.startsWith("TRD")).toBe(false);
  });
});
