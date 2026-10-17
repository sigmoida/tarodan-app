import {
  netsisArpCode,
  netsisItemCode,
  netsisSlipKey,
  readNetsisEDocumentState,
  readNetsisEttn,
  readNetsisSlipTotals,
  sameNetsisSlip,
  sumNetsisSlipLines,
} from "./netsis-model.helper";
import type { NetsisItemSlip } from "./netsis.types";

describe("netsis-model.helper", () => {
  const slip: NetsisItemSlip = {
    FaturaTip: "ftSFat",
    FatUst: {
      FATIRS_NO: " TRD2026000000001 ",
      CARI_KODU: "U10001",
      TARIH: "2026-10-12",
    },
    Kalems: [],
  };

  it("reads the key fields of the (guessed) models in one place", () => {
    expect(netsisArpCode({ CariTemelBilgi: { CARI_KOD: "U1" } })).toBe("U1");
    expect(netsisItemCode({ StokTemelBilgi: { STOK_KODU: "HZM" } })).toBe(
      "HZM",
    );
    expect(netsisSlipKey(slip)).toEqual({
      FaturaTip: "ftSFat",
      FATIRS_NO: "TRD2026000000001",
      CARI_KODU: "U10001",
    });
    expect(
      netsisSlipKey({ ...slip, FatUst: { ...slip.FatUst, FATIRS_NO: "" } }),
    ).toBeNull();
  });

  it("identifies a slip by type + number", () => {
    const a = { FaturaTip: "ftSFat", FATIRS_NO: "TRD1" };
    expect(sameNetsisSlip(a, { ...a })).toBe(true);
    expect(sameNetsisSlip(a, { ...a, FaturaTip: "ftAFat" })).toBe(false);
    expect(sameNetsisSlip(a, { ...a, FATIRS_NO: "TRD2" })).toBe(false);
  });

  describe("sumNetsisSlipLines", () => {
    it("sums line nets and per-line rounded VAT with Decimal precision", () => {
      const totals = sumNetsisSlipLines([
        // 3 × 33.33 = 99.99; KDV %20 = 19.998 → 20.00
        { STOK_KODU: "A", STHAR_GCMIK: 3, STHAR_NF: "33.33", STHAR_KDV: 20 },
        // 0.1 + 0.2 sorunu yok: 1 × 0.10 + KDV %10 = 0.01
        { STOK_KODU: "B", STHAR_GCMIK: "1", STHAR_NF: 0.1, STHAR_KDV: "10" },
        // KDV'siz satır
        { STOK_KODU: "C", STHAR_GCMIK: 2, STHAR_NF: "0.20", STHAR_KDV: 0 },
      ]);

      expect(totals.netAmount.toFixed(2)).toBe("100.49");
      expect(totals.vatAmount.toFixed(2)).toBe("20.01");
      expect(totals.grossAmount.toFixed(2)).toBe("120.50");
    });

    it("rounds half up per line", () => {
      // 1 × 0.125 → 0.13 net; %20 → 0.026 → 0.03
      const totals = sumNetsisSlipLines([
        { STOK_KODU: "A", STHAR_GCMIK: 1, STHAR_NF: "0.125", STHAR_KDV: 20 },
      ]);
      expect(totals.netAmount.toFixed(2)).toBe("0.13");
      expect(totals.vatAmount.toFixed(2)).toBe("0.03");
    });

    it("returns zeros for no lines", () => {
      const totals = sumNetsisSlipLines([]);
      expect(totals.grossAmount.toFixed(2)).toBe("0.00");
    });
  });

  it("reads Calculate totals from the header (or the root)", () => {
    const fromHeader = readNetsisSlipTotals({
      FatUst: { GENELTOPLAM: "120.50", KDV: 20.01 },
    });
    expect(fromHeader.netAmount.toFixed(2)).toBe("100.49");
    expect(fromHeader.vatAmount.toFixed(2)).toBe("20.01");

    const fromRoot = readNetsisSlipTotals({ GENELTOPLAM: 12, KDV: 2 });
    expect(fromRoot.netAmount.toFixed(2)).toBe("10.00");

    const missing = readNetsisSlipTotals({});
    expect(missing.grossAmount.toFixed(2)).toBe("0.00");
  });

  describe("readNetsisEDocumentState", () => {
    it.each([
      [{ Durum: "Kabul edildi" }, "accepted"],
      [{ DURUM: "ONAYLANDI" }, "accepted"],
      [{ Status: "Success" }, "accepted"],
      [{ Durum: "Gönderildi" }, "sent"],
      [{ Durum: "Gönderildi, kabul bekleniyor" }, "sent"],
      [{ Status: "Queued" }, "sent"],
      [{ Durum: "Reddedildi" }, "rejected"],
      [{ Durum: "Başarısız" }, "rejected"],
      [{ Status: "Error" }, "rejected"],
      [{ Durum: "İPTAL EDİLDİ" }, "cancelled"],
      [{ Durum: "Taslak" }, "draft"],
      [{ Durum: "???" }, "unknown"],
      [{}, "unknown"],
    ])("%p → %s", (raw, expected) => {
      expect(readNetsisEDocumentState(raw)).toBe(expected);
    });
  });

  it("reads the ETTN from the known field names", () => {
    expect(readNetsisEttn({ ETTN: " abc " })).toBe("abc");
    expect(readNetsisEttn({ UUID: "def" })).toBe("def");
    expect(readNetsisEttn({ ETTN: "" })).toBeNull();
    expect(readNetsisEttn({})).toBeNull();
  });
});
