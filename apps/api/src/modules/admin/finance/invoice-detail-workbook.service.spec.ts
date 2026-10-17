import * as ExcelJS from "exceljs";
import type { InvoiceDetailData } from "./invoice-detail.service";
import { InvoiceDetailWorkbookService } from "./invoice-detail-workbook.service";

/**
 * Detay dökümünün künye sayfası belgeyi KESEN sağlayıcıyı yazar: müşavir
 * belgeyi o entegratörün portalında arar, iki sağlayıcı birlikte yaşarken
 * hangisine bakacağını dosyadan okuyabilmeli.
 */
describe("InvoiceDetailWorkbookService — künye", () => {
  const detail: InvoiceDetailData = {
    invoiceNumber: "TRD2026000000001",
    type: "seller_commission",
    description: "Satıcı komisyonu",
    documentType: "EARCHIVE",
    status: "sent",
    provider: "elogo",
    context: "direct_sale",
    ettn: "ettn-1",
    sourceReference: "KYT-ABC",
    billingReference: null,
    issuedAt: new Date("2026-09-01T10:00:00Z"),
    createdAt: new Date("2026-09-01T10:00:00Z"),
    cancelledAt: null,
    cancelReason: null,
    sellerName: "Satıcı",
    sellerCode: "U10001",
    buyerName: null,
    buyerCode: null,
    recipientName: "Satıcı",
    recipientVknTckn: "1234567890",
    recipientEmail: "a@b.c",
    netAmount: 100,
    discountTotal: 0,
    taxAmount: 20,
    vatRate: 20,
    total: 120,
    lines: [],
    source: [],
  };

  const summaryOf = async (data: InvoiceDetailData) => {
    const buffer = await new InvoiceDetailWorkbookService().build(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const rows = new Map<string, unknown>();
    workbook.getWorksheet("Fatura")?.eachRow((row) => {
      rows.set(String(row.getCell(1).value), row.getCell(2).value);
    });
    return rows;
  };

  it.each([
    ["elogo", "eLogo"],
    ["netsis", "Logo Netsis"],
  ] as const)("sağlayıcı %s → %s", async (provider, label) => {
    const rows = await summaryOf({ ...detail, provider });

    expect(rows.get("e-Belge Sağlayıcısı")).toBe(label);
  });
});
