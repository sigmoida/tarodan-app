import type { FiscalInvoice } from "@prisma/client";
import type { PrismaService } from "../../../prisma";
import type { InvoiceDocumentService } from "../invoice-document.service";
import { NETSIS_INVOICE_SETTING_KEYS } from "../provider/netsis-invoice-settings";
import { FiscalInvoicePdfService } from "./fiscal-invoice-pdf.service";
import { renderFiscalInvoicePdf } from "./fiscal-invoice-pdf.renderer";
import type { FiscalInvoicePdfInput } from "./fiscal-invoice-pdf.types";

jest.mock("./fiscal-invoice-pdf.renderer", () => ({
  renderFiscalInvoicePdf: jest.fn(),
}));

const render = renderFiscalInvoicePdf as jest.MockedFunction<
  typeof renderFiscalInvoicePdf
>;

function row(over: Partial<Record<keyof FiscalInvoice, unknown>> = {}) {
  return {
    id: "inv-1",
    type: "commission",
    sourceReference: "KYT-10001",
    documentType: "EARCHIVE",
    invoiceNumber: "EAR2026000000001",
    ettn: "ettn-1",
    netAmount: 100,
    vatRate: 20,
    status: "sent",
    provider: "netsis",
    recipientVknTckn: "11111111110",
    recipientName: "Ada Lovelace",
    recipientEmail: "ada@example.com",
    recipientCity: "Ankara",
    recipientDistrict: "Çankaya",
    recipientStreet: "Gül Sok. 5",
    lineItems: null,
    lineDescription: null,
    billingReference: null,
    billingReferenceIssueDate: null,
    issuedAt: new Date("2026-10-12T11:35:20Z"),
    createdAt: new Date("2026-10-12T11:30:00Z"),
    ...over,
  } as unknown as FiscalInvoice;
}

function build(settings: Array<[string, string]> = []) {
  const findMany = jest.fn(async () =>
    settings.map(([settingKey, settingValue]) => ({ settingKey, settingValue })),
  );
  const documents = {
    supplierParty: jest.fn(() => ({ vknTckn: "1234567890", title: "Tarodan" })),
    buildParty: jest.fn(
      (vknTckn: string, name: string, email?: string | null) => ({
        vknTckn,
        title: name,
        email: email ?? undefined,
      }),
    ),
  };
  const service = new FiscalInvoicePdfService(
    { platformSetting: { findMany } } as unknown as PrismaService,
    documents as unknown as InvoiceDocumentService,
  );
  return { service, documents, findMany };
}

const PDF = Buffer.from("%PDF-1.7 rendered");

describe("FiscalInvoicePdfService.renderForRecord", () => {
  beforeEach(() => {
    render.mockReset();
    render.mockResolvedValue(PDF);
  });

  it("Netsis kaydını basar; alıcı kayıt snapshot'ından kurulur", async () => {
    const { service, documents } = build();

    await expect(service.renderForRecord(row())).resolves.toBe(PDF);

    expect(render).toHaveBeenCalledTimes(1);
    expect(documents.buildParty).toHaveBeenCalledWith(
      "11111111110",
      "Ada Lovelace",
      "ada@example.com",
      { city: "Ankara", district: "Çankaya", address: "Gül Sok. 5" },
    );
    const input = render.mock.calls[0][0] as FiscalInvoicePdfInput;
    expect(input.document.documentNumber).toBe("EAR2026000000001");
    expect(input.verification).toBeUndefined();
  });

  it("çağıranın verdiği e-posta snapshot'ın önüne geçer", async () => {
    const { service, documents } = build();

    await service.renderForRecord(row(), "other@example.com");

    expect(documents.buildParty).toHaveBeenCalledWith(
      "11111111110",
      "Ada Lovelace",
      "other@example.com",
      expect.anything(),
    );
  });

  it("alıcı kimliği yoksa nihai tüketici kimliğiyle basar", async () => {
    const { service, documents } = build();

    await service.renderForRecord(
      row({ recipientVknTckn: null, recipientName: null }),
    );

    expect(documents.buildParty).toHaveBeenCalledWith(
      "11111111111",
      "Müşteri",
      "ada@example.com",
      expect.anything(),
    );
  });

  it("doğrulama bağlantısı ayarlıysa girdiye etiketiyle girer", async () => {
    const { service } = build([
      [
        NETSIS_INVOICE_SETTING_KEYS.earchiveVerificationUrl,
        "https://sorgu.example.com/earsiv",
      ],
    ]);

    await service.renderForRecord(row());

    const input = render.mock.calls[0][0] as FiscalInvoicePdfInput;
    expect(input.verification).toEqual({
      label: "e-Arşiv belge sorgulama",
      url: "https://sorgu.example.com/earsiv",
    });
  });

  it.each([["invoiceNumber"], ["ettn"]])(
    "%s yoksa hiç basmaz",
    async (field) => {
      const { service } = build();

      await expect(
        service.renderForRecord(row({ [field]: null })),
      ).resolves.toBeNull();
      expect(render).not.toHaveBeenCalled();
    },
  );

  it("eLogo kaydı için basmaz (eLogo kendi PDF'ini verir)", async () => {
    const { service, findMany } = build();

    await expect(
      service.renderForRecord(row({ provider: "elogo" })),
    ).resolves.toBeNull();
    expect(render).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("çizim düşerse hata yutulur ve null döner", async () => {
    const { service } = build();
    render.mockRejectedValue(new Error("font"));

    await expect(service.renderForRecord(row())).resolves.toBeNull();
  });

  it("ayar okunamazsa doğrulama bloğu olmadan basar", async () => {
    const { service, findMany } = build();
    findMany.mockRejectedValue(new Error("db"));

    await expect(service.renderForRecord(row())).resolves.toBe(PDF);
    const input = render.mock.calls[0][0] as FiscalInvoicePdfInput;
    expect(input.verification).toBeUndefined();
  });
});
