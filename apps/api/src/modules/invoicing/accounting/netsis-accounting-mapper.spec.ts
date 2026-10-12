import { Prisma } from "@prisma/client";
import {
  NETSIS_ACCOUNTING_FIELDS as F,
  NetsisAccountingMappingError,
  buildNetsisAccountingPosting,
  netsisPartyCari,
  netsisSyncIdempotencyKey,
  paytrSettlementFee,
  type NetsisAccountingMappingSettings,
  type NetsisAccountingParty,
} from "./netsis-accounting-mapper";

const D = (value: string | number) => new Prisma.Decimal(value);

const SETTINGS: NetsisAccountingMappingSettings = {
  accounts: {
    paytrClearing: "102.99.001",
    mainBank: "102.01.001",
    pspFeeExpense: "770.01.001",
  },
  retailCariCode: "120.99.001",
};

const INDIVIDUAL: NetsisAccountingParty = {
  name: "Ayşe Yılmaz",
  taxId: "12345678901",
  adminCode: "B010001",
};
const CORPORATE: NetsisAccountingParty = {
  name: "Kaya Oto A.Ş.",
  taxId: "1234567890",
  adminCode: "K010042",
};

// 2026-10-12 21:30 UTC = 13 Ekim İstanbul: tarih TR takviminden.
const LATE_EVENING_UTC = new Date("2026-10-12T21:30:00Z");

describe("netsis-accounting-mapper", () => {
  describe("invoice_collection", () => {
    it("faturanın carisinde, KDV dahil tutarla, faturayı kapatan tahsilat (ara hesaba)", () => {
      const posting = buildNetsisAccountingPosting(
        {
          kind: "invoice_collection",
          invoiceNumber: "EAR2026000000007",
          issuedAt: LATE_EVENING_UTC,
          gross: D("119.995"),
          cariCode: "K010042",
        },
        SETTINGS,
        "invoice_collection:inv-1",
      );
      expect(posting.operation).toBe("collection");
      expect(posting.amount.toString()).toBe("119.995");
      expect(posting.body).toMatchObject({
        CARI_KOD: "K010042",
        TARIH: "2026-10-13",
        // Decimal → 2 hane yarım yukarı (kuruş kayması yok).
        TUTAR: "120.00",
        BELGE_NO: "EAR2026000000007",
        [F.closesInvoiceNumber]: "EAR2026000000007",
        [F.receiptBankAccount]: "102.99.001",
        [F.trackingReference]: "invoice_collection:inv-1",
      });
      expect(posting.body.ACIKLAMA).toContain("EAR2026000000007");
    });

    it("ara hesap yoksa yapılandırma hatası", () => {
      expect(() =>
        buildNetsisAccountingPosting(
          {
            kind: "invoice_collection",
            invoiceNumber: "EAR2026000000007",
            issuedAt: LATE_EVENING_UTC,
            gross: D(10),
            cariCode: "120.99.001",
          },
          { ...SETTINGS, accounts: { ...SETTINGS.accounts, paytrClearing: "" } },
          "k",
        ),
      ).toThrow(NetsisAccountingMappingError);
    });
  });

  describe("settlement_transfer", () => {
    const source = {
      kind: "settlement_transfer" as const,
      merchant: "marketplace",
      datePaid: new Date("2026-10-01T00:00:00Z"),
      salesTotal: D("1000.00"),
      returnTotal: D("100.00"),
      netTotal: D("873.45"),
    };

    it("ara hesaptan şirket bankasına NET tutar; kesinti gövdede ve açıklamada", () => {
      const posting = buildNetsisAccountingPosting(source, SETTINGS, "s:1");
      expect(posting.operation).toBe("bankTransfer");
      expect(posting.amount.toFixed(2)).toBe("873.45");
      expect(posting.body).toMatchObject({
        TARIH: "2026-10-01",
        TUTAR: "873.45",
        BELGE_NO: "PAYTR-2026-10-01",
        [F.transferFromAccount]: "102.99.001",
        [F.transferToAccount]: "102.01.001",
        [F.feeAmount]: "26.55",
        [F.feeAccount]: "770.01.001",
      });
      expect(posting.body.ACIKLAMA).toContain("26.55");
      expect(posting.body).not.toHaveProperty("CARI_KOD");
    });

    it("gider hesabı opsiyonel: yoksa alan hiç gönderilmez", () => {
      const posting = buildNetsisAccountingPosting(
        source,
        { ...SETTINGS, accounts: { ...SETTINGS.accounts, pspFeeExpense: "" } },
        "s:1",
      );
      expect(posting.body).not.toHaveProperty(F.feeAccount);
    });

    it("banka hesabı yoksa yapılandırma hatası", () => {
      expect(() =>
        buildNetsisAccountingPosting(
          source,
          { ...SETTINGS, accounts: { ...SETTINGS.accounts, mainBank: "" } },
          "s:1",
        ),
      ).toThrow(NetsisAccountingMappingError);
    });

    it("kesinti = satış − iade − net; negatifse sıfır", () => {
      expect(paytrSettlementFee(source).toFixed(2)).toBe("26.55");
      expect(
        paytrSettlementFee({
          salesTotal: D(100),
          returnTotal: D(0),
          netTotal: D(101),
        }).toFixed(2),
      ).toBe("0.00");
    });
  });

  describe("payout_transfer", () => {
    const base = {
      kind: "payout_transfer" as const,
      reference: "PTR-778899",
      amount: D("845.10"),
      completedAt: new Date("2026-10-05T10:00:00Z"),
      ibanLast4: "1234",
    };

    it("kurumsal satıcı: kendi carisi (B/K kodu), şirket bankasından", () => {
      const posting = buildNetsisAccountingPosting(
        { ...base, seller: CORPORATE },
        SETTINGS,
        "payout_transfer:p-1",
      );
      expect(posting.operation).toBe("bankTransfer");
      expect(posting.body).toMatchObject({
        CARI_KOD: "K010042",
        TUTAR: "845.10",
        BELGE_NO: "PTR-778899",
        [F.transferFromAccount]: "102.01.001",
      });
      expect(posting.body.ACIKLAMA).not.toContain("1234");
    });

    it("bireysel satıcı: ortak perakende cari + açıklamada ad ve IBAN son 4", () => {
      const posting = buildNetsisAccountingPosting(
        { ...base, seller: INDIVIDUAL },
        SETTINGS,
        "payout_transfer:p-1",
      );
      expect(posting.body.CARI_KOD).toBe("120.99.001");
      expect(posting.body.ACIKLAMA).toContain("Ayşe Yılmaz");
      expect(posting.body.ACIKLAMA).toContain("1234");
      expect(String(posting.body.ACIKLAMA).length).toBeLessThanOrEqual(50);
      expect(posting.body.BELGE_NO).toBe("PTR-778899");
    });
  });

  describe("refund_reversal", () => {
    const base = {
      kind: "refund_reversal" as const,
      reference: "ORD-K7X9M2QF3N",
      amount: D("59.90"),
      succeededAt: new Date("2026-10-07T08:00:00Z"),
    };

    it("alıcının carisinde NEGATİF tahsilat (ters kayıt), ara hesap", () => {
      const posting = buildNetsisAccountingPosting(
        { ...base, buyer: INDIVIDUAL },
        SETTINGS,
        "refund_reversal:a-1",
      );
      expect(posting.operation).toBe("collection");
      expect(posting.amount.toFixed(2)).toBe("-59.90");
      expect(posting.body).toMatchObject({
        CARI_KOD: "120.99.001",
        TUTAR: "-59.90",
        BELGE_NO: "ORD-K7X9M2QF3N",
        [F.receiptBankAccount]: "102.99.001",
      });
      expect(posting.body.ACIKLAMA).toContain("Ayşe Yılmaz");
    });

    it("kurumsal alıcı kendi carisine", () => {
      const posting = buildNetsisAccountingPosting(
        { ...base, buyer: CORPORATE },
        SETTINGS,
        "refund_reversal:a-1",
      );
      expect(posting.body.CARI_KOD).toBe("K010042");
    });
  });

  describe("netsisPartyCari", () => {
    it("VKN → kendi carisi; TCKN/boş → ortak cari", () => {
      expect(netsisPartyCari(CORPORATE, "R")).toEqual({
        code: "K010042",
        pooled: false,
      });
      expect(netsisPartyCari(INDIVIDUAL, "R")).toEqual({
        code: "R",
        pooled: true,
      });
      expect(
        netsisPartyCari({ ...INDIVIDUAL, taxId: null }, "R").pooled,
      ).toBe(true);
    });

    it("ortak cari ayarı yoksa ya da kurumsal kod geçersizse yapılandırma hatası", () => {
      expect(() => netsisPartyCari(INDIVIDUAL, "")).toThrow(
        NetsisAccountingMappingError,
      );
      expect(() =>
        netsisPartyCari({ ...CORPORATE, adminCode: "K".repeat(16) }, "R"),
      ).toThrow(NetsisAccountingMappingError);
    });
  });

  it("idempotency anahtarı tür + kaynak", () => {
    expect(netsisSyncIdempotencyKey("payout_transfer", "p-1")).toBe(
      "payout_transfer:p-1",
    );
  });
});
