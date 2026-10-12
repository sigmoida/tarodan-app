import type { ConfigService } from "@nestjs/config";
import type { ElogoService } from "../elogo.service";
import type { ElogoSendDocumentParams } from "./elogo.types";
import { ElogoInvoiceProvider } from "./elogo.provider";
import type { FiscalDocumentInput } from "./e-invoice-provider";

function fakeConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, def?: string) => (key in values ? values[key] : def),
  } as unknown as ConfigService;
}

function makeElogo(over: Partial<Record<keyof ElogoService, unknown>> = {}) {
  const base = {
    isEnabled: jest.fn(() => true),
    checkUser: jest.fn(async (_identifier: string) => null),
    sendDocument: jest.fn(async (_params: ElogoSendDocumentParams) => ({
      success: true,
      code: 1,
      refId: 42,
      documentUuid: "ettn-1",
      description: "OK",
    })),
    getDocumentStatus: jest.fn(async () => ({
      documentUuid: "ettn-1",
      status: 2,
      code: 1300,
    })),
    cancelEArchiveInvoice: jest.fn(async () => ({
      success: true,
      code: 1,
      description: "iptal edildi",
    })),
    getEArchiveInvoicePdf: jest.fn(async () => Buffer.from("%PDF-1.4")),
    refundStrategy: jest.fn(() => "CANCEL"),
  };
  return Object.assign(base, over);
}

function build(
  over: Partial<Record<keyof ElogoService, unknown>> = {},
  config: Record<string, string> = {},
) {
  const elogo = makeElogo(over);
  const provider = new ElogoInvoiceProvider(
    elogo as unknown as ElogoService,
    fakeConfig(config),
  );
  return { elogo, provider };
}

function document(
  over: Partial<FiscalDocumentInput> = {},
): FiscalDocumentInput {
  return {
    scenario: "EARCHIVE",
    kind: "SALE",
    documentNumber: "TRD2026000000001",
    ettn: "ettn-1",
    issueDate: "2026-10-12",
    issueTime: "10:00:00",
    currency: "TRY",
    sendType: "ELEKTRONIK",
    note: "Komisyon",
    supplier: { vknTckn: "7620277268", title: "TARODAN" },
    customer: { vknTckn: "11111111111", firstName: "Ad", lastName: "Soyad" },
    lines: [{ name: "Komisyon", quantity: 1, unitPrice: 100, vatRate: 20 }],
    ...over,
  };
}

describe("ElogoInvoiceProvider", () => {
  describe("send", () => {
    it("e-Arşiv satış belgesini UBL-TR'ye çevirip eLogo'ya yollar", async () => {
      const { elogo, provider } = build({}, { ELOGO_INVOICE_XSLT_UUID: "X1" });

      const res = await provider.send(document(), {});

      expect(elogo.sendDocument).toHaveBeenCalledTimes(1);
      const params = elogo.sendDocument.mock.calls[0][0];
      expect(params).toEqual(
        expect.objectContaining({
          documentType: "EARCHIVE",
          documentUuid: "ettn-1",
          documentNumber: "TRD2026000000001",
          signed: false,
          xsltUuid: "X1",
        }),
      );
      expect(params).not.toHaveProperty("alias");
      expect(params.ublXml).toContain(
        "<cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>",
      );
      expect(params.ublXml).toContain(
        "<cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>",
      );
      expect(params.ublXml).toContain("<cbc:ID>gonderimSekli</cbc:ID>");
      expect(res).toEqual({
        accepted: true,
        providerRef: "42",
        ettn: "ettn-1",
        resultCode: 1,
        resultMsg: "OK",
      });
    });

    it("e-Fatura iade belgesi: TEMELFATURA + IADE, alıcı etiketi ve orijinal referans", async () => {
      const { elogo, provider } = build();

      await provider.send(
        document({
          scenario: "EINVOICE",
          kind: "RETURN",
          sendType: undefined,
          billingReference: {
            documentNumber: "TRD2026000000000",
            issueDate: "2026-10-01",
          },
        }),
        { recipientAlias: "urn:mail:pk@x" },
      );

      const params = elogo.sendDocument.mock.calls[0][0];
      expect(params.documentType).toBe("EINVOICE");
      expect(params.alias).toBe("urn:mail:pk@x");
      expect(params).not.toHaveProperty("xsltUuid");
      expect(params.ublXml).toContain(
        "<cbc:ProfileID>TEMELFATURA</cbc:ProfileID>",
      );
      expect(params.ublXml).toContain(
        "<cbc:InvoiceTypeCode>IADE</cbc:InvoiceTypeCode>",
      );
      expect(params.ublXml).toContain("<cbc:ID>TRD2026000000000</cbc:ID>");
      expect(params.ublXml).not.toContain("gonderimSekli");
    });

    it("refId yoksa sağlayıcı referansı boş kalır", async () => {
      const { provider } = build({
        sendDocument: jest.fn(async () => ({ success: true, code: 1 })),
      });
      const res = await provider.send(document(), {});
      expect(res).toEqual(
        expect.objectContaining({ accepted: true, providerRef: undefined }),
      );
    });

    it.each([
      ["Aynı fatura numarası tekrar kullanılamaz", "duplicate-number"],
      [
        "TRD2026000000502 numaralı fatura daha önce gönderildi",
        "duplicate-number",
      ],
      ["XSLT tasarım hatası. (GetXsltDocument fail!)", "configuration"],
      ["VKN geçersiz", "unknown"],
      [undefined, "unknown"],
    ])("red '%s' → %s", async (description, category) => {
      const { provider } = build({
        sendDocument: jest.fn(async () => ({
          success: false,
          code: -1,
          description,
        })),
      });
      const res = await provider.send(document(), {});
      expect(res).toEqual({
        accepted: false,
        category,
        resultCode: -1,
        resultMsg: description,
      });
    });

    it("ulaşım hatası dönüş değeri değil, fırlatılır", async () => {
      const { provider } = build({
        sendDocument: jest.fn(async () => {
          throw new Error("ETIMEDOUT");
        }),
      });
      await expect(provider.send(document(), {})).rejects.toThrow("ETIMEDOUT");
    });

    it("yerel numarası olmayan belge eLogo'ya gitmez", async () => {
      const { elogo, provider } = build();
      await expect(
        provider.send(document({ documentNumber: undefined }), {}),
      ).rejects.toThrow();
      expect(elogo.sendDocument).not.toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it.each([
      [{ status: 2, code: 1300, isCancel: true }, "cancelled"],
      [{ status: 2 }, "completed"],
      [{ status: -1, code: 1300 }, "completed"],
      [{ status: 1, code: 1100 }, "processing"],
      [{ status: -1, code: 1160 }, "failed"],
      [{ status: 0 }, "unknown"],
    ])("%o → %s", async (raw, state) => {
      const { elogo, provider } = build({
        getDocumentStatus: jest.fn(async () => ({
          documentUuid: "ettn-1",
          description: "d",
          ...raw,
        })),
      });

      const res = await provider.getStatus({ ettn: "ettn-1" }, "EINVOICE");

      expect(elogo.getDocumentStatus).toHaveBeenCalledWith(
        "ettn-1",
        "EINVOICE",
      );
      expect(res).toEqual({
        state,
        resultCode: (raw as { code?: number }).code,
        resultMsg: "d",
      });
    });
  });

  describe("cancelEArchive", () => {
    it("ETTN ve sağlayıcı referansıyla iptal eder", async () => {
      const { elogo, provider } = build();
      const res = await provider.cancelEArchive({
        ettn: "ettn-1",
        providerRef: "42",
      });
      expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledWith("ettn-1", "42");
      expect(res).toEqual({
        success: true,
        resultCode: 1,
        resultMsg: "iptal edildi",
      });
    });

    it("referans yoksa elementId gönderilmez", async () => {
      const { elogo, provider } = build();
      await provider.cancelEArchive({ ettn: "ettn-1", providerRef: null });
      expect(elogo.cancelEArchiveInvoice).toHaveBeenCalledWith(
        "ettn-1",
        undefined,
      );
    });
  });

  it("fetchPdf PostBox PDF'ini ETTN ile çeker", async () => {
    const { elogo, provider } = build();
    const pdf = await provider.fetchPdf({ ettn: "ettn-1" });
    expect(elogo.getEArchiveInvoicePdf).toHaveBeenCalledWith("ettn-1");
    expect(pdf?.toString()).toBe("%PDF-1.4");
  });

  describe("resolveRecipientKind", () => {
    it("mükellefse EINVOICE + posta kutusu etiketi", async () => {
      const { provider } = build({
        checkUser: jest.fn(async () => ({
          identifier: "1234567890",
          isEInvoiceUser: true,
          eInvoicePkAlias: "urn:mail:pk@x",
        })),
      });
      expect(await provider.resolveRecipientKind("1234567890")).toEqual({
        kind: "EINVOICE",
        alias: "urn:mail:pk@x",
      });
    });

    it("mükellef değilse EARCHIVE", async () => {
      const { provider } = build({
        checkUser: jest.fn(async () => ({
          identifier: "1234567890",
          isEInvoiceUser: false,
        })),
      });
      expect(await provider.resolveRecipientKind("1234567890")).toEqual(
        expect.objectContaining({ kind: "EARCHIVE" }),
      );
    });

    it("sonuç yoksa null; sorgu hatası yutulmaz", async () => {
      expect(await build().provider.resolveRecipientKind("1")).toBeNull();
      const failing = build({
        checkUser: jest.fn(async () => {
          throw new Error("ECONNRESET");
        }),
      });
      await expect(
        failing.provider.resolveRecipientKind("1234567890"),
      ).rejects.toThrow("ECONNRESET");
    });
  });

  describe("classifyError", () => {
    it.each([
      [new Error("ETIMEDOUT"), "network"],
      [new Error("503 Service Unavailable"), "network"],
      ["socket hang up", "network"],
      [
        new Error("Aynı fatura numarası tekrar kullanılamaz"),
        "duplicate-number",
      ],
      [new Error("XSLT tasarım hatası"), "configuration"],
      [new Error("VKN geçersiz"), "unknown"],
      [undefined, "unknown"],
    ])("%p → %s", (error, category) => {
      expect(build().provider.classifyError(error)).toBe(category);
    });
  });

  it("isEnabled ve iade stratejisi ElogoService'e devredilir", () => {
    const { elogo, provider } = build({
      isEnabled: jest.fn(() => false),
      refundStrategy: jest.fn(() => "RETURN_INVOICE"),
    });
    const issued = new Date("2026-10-01T00:00:00Z");
    expect(provider.isEnabled()).toBe(false);
    expect(provider.eArchiveReversalStrategy(issued)).toBe("RETURN_INVOICE");
    expect(elogo.refundStrategy).toHaveBeenCalledWith(issued, undefined);
  });
});
