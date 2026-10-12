import { FiscalInvoiceType, Prisma } from "@prisma/client";
import { NETSIS_DOC_TYPES } from "../../netsis";
import type { FiscalDocumentInput } from "./e-invoice-provider";
import {
  NETSIS_EDOCUMENT_KIND,
  NETSIS_HEADER_FIELDS,
  NETSIS_LINE_FIELDS,
  NETSIS_SLIP_TIPI,
} from "./netsis-invoice.constants";
import {
  buildNetsisCorporateArp,
  buildNetsisServiceItem,
  buildNetsisSlip,
  expectedNetsisTotals,
  formatNetsisProviderRef,
  netsisDocTypeOf,
  netsisItemTypeOf,
  netsisTotalsMismatches,
  parseNetsisProviderRef,
} from "./netsis-slip.mapper";

const F = NETSIS_HEADER_FIELDS;

function document(over: Partial<FiscalDocumentInput> = {}): FiscalDocumentInput {
  return {
    scenario: "EARCHIVE",
    kind: "SALE",
    ettn: "11111111-2222-4333-8444-555555555555",
    issueDate: "2026-10-12",
    issueTime: "10:15:00",
    currency: "TRY",
    sendType: "ELEKTRONIK",
    note: "Satıcı aracılık hizmet (komisyon) bedeli — Kayıt No: KYT-K7X9M2QF3N",
    supplier: { vknTckn: "7620277268", title: "TARODAN" },
    customer: {
      vknTckn: "12345678901",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      city: "Bursa",
      district: "Nilüfer",
      streetAddress: "Koleksiyon Sok. No:3",
      email: "ayse@example.com",
    },
    lines: [
      {
        name: "Satıcı aracılık hizmet (komisyon) bedeli",
        quantity: 1,
        unitPrice: 100,
        vatRate: 20,
      },
    ],
    ...over,
  };
}

describe("netsis-slip.mapper", () => {
  describe("netsisItemTypeOf — her belge türünün kartı", () => {
    it.each(
      Object.values(FiscalInvoiceType).filter(
        (type) => type !== FiscalInvoiceType.return_invoice,
      ),
    )("%s kendi kartıyla kesilir", (type) => {
      expect(netsisItemTypeOf(type)).toBe(type);
    });

    it("iade faturası orijinal belgenin kartıyla kesilir", () => {
      expect(netsisItemTypeOf("return_invoice", "seller_commission")).toBe(
        "seller_commission",
      );
      expect(netsisItemTypeOf("return_invoice", "platform_sale")).toBe(
        "platform_sale",
      );
    });

    it("orijinali çözülemeyen iade faturasının kartı yoktur", () => {
      expect(netsisItemTypeOf("return_invoice")).toBeNull();
      expect(netsisItemTypeOf("return_invoice", null)).toBeNull();
      expect(netsisItemTypeOf("return_invoice", "return_invoice")).toBeNull();
    });
  });

  it("belge tipi: satış → satış faturası, iade → iade tipi", () => {
    expect(netsisDocTypeOf("SALE")).toBe(NETSIS_DOC_TYPES.salesInvoice);
    expect(netsisDocTypeOf("RETURN")).toBe(
      NETSIS_DOC_TYPES.salesReturnInvoice,
    );
  });

  describe("providerRef", () => {
    it("tip ve numarayı taşır, geri ayrıştırılır", () => {
      const ref = formatNetsisProviderRef("ftSFat", "EAR2026000000001");
      expect(ref).toBe("ftSFat:EAR2026000000001");
      expect(parseNetsisProviderRef(ref)).toEqual({
        docType: "ftSFat",
        documentNumber: "EAR2026000000001",
      });
    });

    it.each([null, undefined, "", "42", ":EAR1", "ftSFat:"])(
      "eLogo refId ya da bozuk referans (%p) Netsis referansı değildir",
      (ref) => {
        expect(parseNetsisProviderRef(ref)).toBeNull();
      },
    );
  });

  describe("buildNetsisSlip", () => {
    it("ortak perakende cari: başlık belgenin GERÇEK alıcısını taşır", () => {
      const slip = buildNetsisSlip({
        document: document(),
        cariCode: "120.01.001",
        pooledCari: true,
        itemCode: "HZM-KOM",
        documentNumber: "EAR2026000000001",
        sourceReference: "KYT-K7X9M2QF3N",
      });

      expect(slip.FaturaTip).toBe(NETSIS_DOC_TYPES.salesInvoice);
      expect(slip.FatUst).toEqual({
        CARI_KODU: "120.01.001",
        FATIRS_NO: "EAR2026000000001",
        TARIH: "2026-10-12",
        TIPI: NETSIS_SLIP_TIPI.sale,
        ACIKLAMA: expect.any(String),
        [F.eDocumentKind]: NETSIS_EDOCUMENT_KIND.EARCHIVE,
        [F.eArchiveSendType]: "ELEKTRONIK",
        [F.issueTime]: "10:15:00",
        [F.ettn]: "11111111-2222-4333-8444-555555555555",
        [F.ourEttnReference]: "11111111-2222-4333-8444-555555555555",
        [F.sourceReference]: "KYT-K7X9M2QF3N",
        [F.recipientFirstName]: "Ayşe",
        [F.recipientLastName]: "Yılmaz",
        [F.recipientTaxId]: "12345678901",
        [F.recipientAddress]: "Koleksiyon Sok. No:3",
        [F.recipientCity]: "Bursa",
        [F.recipientDistrict]: "Nilüfer",
        [F.recipientEmail]: "ayse@example.com",
      });
      expect((slip.FatUst.ACIKLAMA ?? "").length).toBeLessThanOrEqual(50);
      expect(slip.Kalems).toEqual([
        {
          STOK_KODU: "HZM-KOM",
          STHAR_GCMIK: "1",
          STHAR_NF: "100.000000",
          STHAR_BF: "100.000000",
          STHAR_KDV: "20",
          STHAR_ACIKLAMA: "Satıcı aracılık hizmet (komisyon) bedeli",
        },
      ]);
    });

    it("kurumsal cari: alıcı kartın kendisidir, başlığa kişi alanı yazılmaz", () => {
      const slip = buildNetsisSlip({
        document: document({
          scenario: "EINVOICE",
          sendType: undefined,
          customer: { vknTckn: "1234567890", title: "Model Araç A.Ş." },
        }),
        cariCode: "K010042",
        pooledCari: false,
        itemCode: "HZM-KOM",
      });

      expect(slip.FatUst.CARI_KODU).toBe("K010042");
      expect(slip.FatUst[F.eDocumentKind]).toBe(NETSIS_EDOCUMENT_KIND.EINVOICE);
      expect(slip.FatUst).not.toHaveProperty(F.eArchiveSendType);
      expect(slip.FatUst).not.toHaveProperty(F.recipientTitle);
      expect(slip.FatUst).not.toHaveProperty(F.recipientTaxId);
      // Numara verilmediyse (Calculate öncesi) FATIRS_NO yok.
      expect(slip.FatUst).not.toHaveProperty("FATIRS_NO");
      expect(slip.FatUst).not.toHaveProperty(F.sourceReference);
    });

    it("iade faturası: iade tipi + orijinal belge referansı", () => {
      const slip = buildNetsisSlip({
        document: document({
          kind: "RETURN",
          billingReference: {
            documentNumber: "EAR2026000000001",
            issueDate: "2026-10-01",
          },
        }),
        cariCode: "120.01.001",
        pooledCari: true,
        itemCode: "HZM-KOM",
        documentNumber: "EAR2026000000007",
      });

      expect(slip.FaturaTip).toBe(NETSIS_DOC_TYPES.salesReturnInvoice);
      expect(slip.FatUst.TIPI).toBe(NETSIS_SLIP_TIPI.return);
      expect(slip.FatUst[F.returnOfNumber]).toBe("EAR2026000000001");
      expect(slip.FatUst[F.returnOfDate]).toBe("2026-10-01");
    });

    it("çok kalemli ürün faturası: tüm satırlar aynı kart, iskonto yüzde olarak", () => {
      const slip = buildNetsisSlip({
        document: document({
          lines: [
            {
              name: "Diecast Model 1:18",
              quantity: 3,
              unitPrice: 40,
              discount: 20,
              lineExtension: 100,
              vatRate: 20,
            },
            { name: "Kargo bedeli", quantity: 1, unitPrice: 50, vatRate: 20 },
          ],
        }),
        cariCode: "120.01.001",
        pooledCari: true,
        itemCode: "URUN-SATIS",
      });

      expect(slip.Kalems.map((line) => line.STOK_KODU)).toEqual([
        "URUN-SATIS",
        "URUN-SATIS",
      ]);
      // 100 / 3 birim net; brüt birim 40; iskonto 20 / 120 = %16,6667.
      expect(slip.Kalems[0]).toMatchObject({
        STHAR_GCMIK: "3",
        STHAR_NF: "33.333333",
        STHAR_BF: "40.000000",
        [NETSIS_LINE_FIELDS.discountPercent]: "16.6667",
      });
      expect(slip.Kalems[1]).not.toHaveProperty(
        NETSIS_LINE_FIELDS.discountPercent,
      );
    });
  });

  it("kurumsal cari kartı: kod B/K kodu, vergi bilgisiyle", () => {
    expect(
      buildNetsisCorporateArp("K010042", {
        vknTckn: "1234567890",
        title: "Model Araç A.Ş.",
        taxOffice: "Nilüfer",
        city: "Bursa",
        email: "muhasebe@example.com",
      }),
    ).toEqual({
      CariTemelBilgi: {
        CARI_KOD: "K010042",
        CARI_ISIM: "Model Araç A.Ş.",
        VERGI_NUMARASI: "1234567890",
        VERGI_DAIRESI: "Nilüfer",
        CARI_IL: "Bursa",
        EMAIL: "muhasebe@example.com",
      },
    });
  });

  it("hizmet kartı: ad kırpılır, birim adet", () => {
    const item = buildNetsisServiceItem("HZM-KOM", "x".repeat(80), 20);
    expect(item.StokTemelBilgi).toEqual({
      STOK_KODU: "HZM-KOM",
      STOK_ADI: "x".repeat(50),
      KDV_ORANI: 20,
      OLCU_BR1: "AD",
    });
  });

  describe("toplam karşılaştırması", () => {
    const expected = expectedNetsisTotals(
      document({
        lines: [
          { name: "a", quantity: 1, unitPrice: 100, vatRate: 20 },
          { name: "b", quantity: 1, unitPrice: 10.05, vatRate: 20 },
        ],
      }),
    );
    const d = (value: string) => new Prisma.Decimal(value);

    it("beyan toplamları belge toplamlarının tek hesabından gelir", () => {
      expect(expected.netAmount.toFixed(2)).toBe("110.05");
      expect(expected.vatAmount.toFixed(2)).toBe("22.01");
      expect(expected.grossAmount.toFixed(2)).toBe("132.06");
    });

    it("tolerans (0,01) içindeki fark kabul edilir", () => {
      expect(
        netsisTotalsMismatches(expected, {
          netAmount: d("110.05"),
          vatAmount: d("22.02"),
          grossAmount: d("132.07"),
        }),
      ).toEqual([]);
    });

    it("toleransı aşan her alan raporlanır", () => {
      expect(
        netsisTotalsMismatches(expected, {
          netAmount: d("110.05"),
          vatAmount: d("22.03"),
          grossAmount: d("132.08"),
        }),
      ).toEqual([
        { field: "vatAmount", expected: "22.01", calculated: "22.03" },
        { field: "grossAmount", expected: "132.06", calculated: "132.08" },
      ]);
    });
  });
});
