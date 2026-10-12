import { BadRequestException } from "@nestjs/common";
import type {
  NetsisArp,
  NetsisItem,
  NetsisItemSlip,
} from "../helpers/netsis.types";
import { NetsisRequestException } from "../http/netsis-error";
import { NetsisStubGateway } from "./netsis-stub.gateway";

describe("NetsisStubGateway", () => {
  const year = new Date().getFullYear();
  let stub: NetsisStubGateway;

  const arp: NetsisArp = {
    CariTemelBilgi: { CARI_KOD: "U10001", CARI_ISIM: "Ayşe Yılmaz" },
  };
  const service: NetsisItem = {
    StokTemelBilgi: { STOK_KODU: "HZM-KOMISYON", KDV_ORANI: 20 },
  };
  const slip = (number?: string): NetsisItemSlip => ({
    FaturaTip: "ftSFat",
    FatUst: { FATIRS_NO: number, CARI_KODU: "U10001", TARIH: "2026-10-12" },
    Kalems: [
      {
        STOK_KODU: "HZM-KOMISYON",
        STHAR_GCMIK: 2,
        STHAR_NF: "49.995",
        STHAR_KDV: 20,
      },
    ],
  });
  const keyOf = (number: string) => ({
    FaturaTip: "ftSFat",
    FATIRS_NO: number,
  });

  const seed = async () => {
    await stub.arps.create(arp);
    await stub.items.create(service);
  };

  beforeEach(() => {
    stub = new NetsisStubGateway();
  });

  it("issues deterministic, incrementing GİB-shaped numbers per serial", async () => {
    await expect(stub.itemSlips.newEInvoiceNumber("TRD")).resolves.toBe(
      `TRD${year}000000001`,
    );
    await expect(stub.itemSlips.newEArchiveNumber("TRD")).resolves.toBe(
      `TRD${year}000000002`,
    );
    await expect(stub.itemSlips.newEArchiveNumber("EAR")).resolves.toBe(
      `EAR${year}000000001`,
    );
    expect(`TRD${year}000000001`).toHaveLength(16);
  });

  it("rejects a serial that is not 3 upper-case characters", async () => {
    await expect(stub.itemSlips.newEArchiveNumber("tr")).rejects.toMatchObject({
      kind: "validation",
    });
  });

  it("calculates totals from the lines with Decimal, rounding per line", async () => {
    const totals = await stub.itemSlips.calculate(slip());

    // 2 × 49.995 = 99.99; KDV %20 = 19.998 → 20.00
    expect(totals.netAmount.toFixed(2)).toBe("99.99");
    expect(totals.vatAmount.toFixed(2)).toBe("20.00");
    expect(totals.grossAmount.toFixed(2)).toBe("119.99");
  });

  describe("cari and items", () => {
    it("stores, finds and updates a cari; duplicates conflict", async () => {
      await stub.arps.create(arp);
      await expect(stub.arps.findByCode("U10001")).resolves.toEqual(arp);
      await expect(stub.arps.findByCode("nope")).resolves.toBeNull();
      await expect(stub.arps.create(arp)).rejects.toMatchObject({
        kind: "conflict",
      });

      const renamed: NetsisArp = {
        CariTemelBilgi: { ...arp.CariTemelBilgi, CARI_ISIM: "Ayşe Kaya" },
      };
      await stub.arps.update("U10001", renamed);
      await expect(stub.arps.findByCode("U10001")).resolves.toEqual(renamed);
      await expect(stub.arps.update("nope", renamed)).rejects.toMatchObject({
        kind: "validation",
      });
    });

    it("returns copies, so callers cannot mutate the store", async () => {
      await stub.arps.create(arp);
      const found = await stub.arps.findByCode("U10001");
      if (!found) throw new Error("expected the cari");
      found.CariTemelBilgi.CARI_ISIM = "mutated";

      await expect(stub.arps.findByCode("U10001")).resolves.toEqual(arp);
    });

    it("ensures a service item once", async () => {
      await stub.items.ensureServiceItem(service);
      await stub.items.ensureServiceItem(service);
      expect(stub.snapshot().items).toEqual([service]);
    });
  });

  describe("invoices", () => {
    it("refuses a slip whose cari or item does not exist", async () => {
      await expect(stub.itemSlips.create(slip("TRD1"))).rejects.toMatchObject({
        kind: "validation",
      });
      await stub.arps.create(arp);
      await expect(stub.itemSlips.create(slip("TRD1"))).rejects.toMatchObject({
        kind: "validation",
      });
    });

    it("numbers an unnumbered slip and conflicts on a duplicate number", async () => {
      await seed();
      const created = await stub.itemSlips.create(slip());
      expect(created.FatUst.FATIRS_NO).toBe(`TRD${year}000000001`);

      const error = await stub.itemSlips
        .create(slip(`TRD${year}000000001`))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NetsisRequestException);
      expect(error).toMatchObject({ kind: "conflict" });
    });

    it("returns details and html for a stored slip, null for an unknown one", async () => {
      await seed();
      await stub.itemSlips.create(slip("TRD2026000000009"));

      await expect(
        stub.itemSlips.details(keyOf("TRD2026000000009")),
      ).resolves.toMatchObject({ FatUst: { FATIRS_NO: "TRD2026000000009" } });
      await expect(stub.itemSlips.details(keyOf("X"))).resolves.toBeNull();
      await expect(
        stub.itemSlips.html(keyOf("TRD2026000000009")),
      ).resolves.toContain("TRD2026000000009");
    });

    it("deletes a draft slip but not one with a sent e-document", async () => {
      await seed();
      await stub.itemSlips.create(slip("TRD1"));
      await stub.itemSlips.create(slip("TRD2"));
      await stub.eDocuments.send(keyOf("TRD2"));

      await stub.itemSlips.delete(keyOf("TRD1"));
      await expect(stub.itemSlips.details(keyOf("TRD1"))).resolves.toBeNull();
      await expect(stub.itemSlips.delete(keyOf("TRD2"))).rejects.toMatchObject({
        kind: "validation",
      });
    });
  });

  describe("e-documents", () => {
    beforeEach(async () => {
      await seed();
      await stub.itemSlips.create(slip("TRD1"));
    });

    it("send assigns a deterministic ETTN and marks the document sent", async () => {
      const result = await stub.eDocuments.send(keyOf("TRD1"));

      expect(result.ettn).toMatch(/^00000000-0000-4000-8000-[0-9a-f]{12}$/);
      await expect(stub.eDocuments.check(keyOf("TRD1"))).resolves.toEqual({
        state: "sent",
        ettn: result.ettn,
        raw: { ETTN: result.ettn, Durum: "sent" },
      });
    });

    it("check reports draft before sending", async () => {
      await expect(stub.eDocuments.check(keyOf("TRD1"))).resolves.toEqual({
        state: "draft",
        ettn: null,
        raw: {},
      });
    });

    it("refuses a second send while the first stands, allows it after a rejection", async () => {
      const first = await stub.eDocuments.send(keyOf("TRD1"));
      await expect(stub.eDocuments.send(keyOf("TRD1"))).rejects.toMatchObject({
        kind: "conflict",
      });

      if (!first.ettn) throw new Error("expected an ETTN");
      stub.setEDocumentState(first.ettn, "rejected");
      const second = await stub.eDocuments.send(keyOf("TRD1"));
      expect(second.ettn).not.toBe(first.ettn);
    });

    it("cancels only a sent e-archive document", async () => {
      await expect(
        stub.eDocuments.cancelEArchive(keyOf("TRD1")),
      ).rejects.toMatchObject({ kind: "validation" });

      await stub.eDocuments.send(keyOf("TRD1"));
      await stub.eDocuments.cancelEArchive(keyOf("TRD1"));
      await expect(stub.eDocuments.check(keyOf("TRD1"))).resolves.toMatchObject(
        { state: "cancelled" },
      );
    });

    it("needs an existing slip", async () => {
      await expect(stub.eDocuments.send(keyOf("NOPE"))).rejects.toMatchObject({
        kind: "validation",
        upstreamStatus: 404,
      });
    });

    it("shows the sent document", async () => {
      const { ettn } = await stub.eDocuments.send(keyOf("TRD1"));
      await expect(stub.eDocuments.show(keyOf("TRD1"))).resolves.toContain(
        String(ettn),
      );
    });
  });

  describe("transactions", () => {
    it("commits through the shared withTransaction helper", async () => {
      const result = await stub.transactions.withTransaction(async (tx) => {
        await stub.arps.create(arp, tx);
        return tx.transactionId;
      });

      expect(stub.snapshot().transactions).toEqual([
        { id: result, state: "committed" },
      ]);
    });

    it("rolls back on failure and refuses to close a closed transaction", async () => {
      await expect(
        stub.transactions.withTransaction(async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      const [tx] = stub.snapshot().transactions;
      expect(tx.state).toBe("rolledBack");

      await expect(stub.transactions.commit(tx.id)).rejects.toMatchObject({
        kind: "validation",
      });
    });
  });

  it("keeps collections and bank transfers", async () => {
    const created = await stub.receipts.createCollection({ TUTAR: "119.99" });
    await expect(
      stub.receipts.getCollection(String(created.ID)),
    ).resolves.toEqual(created);
    await expect(stub.receipts.getCollection("nope")).resolves.toBeNull();

    await stub.receipts.createBankTransfer({ TUTAR: 95 });
    expect(stub.snapshot().bankTransfers).toHaveLength(1);
  });

  it("writes receipts only to an existing cari, with deterministic keys", async () => {
    await expect(
      stub.receipts.createCollection({ CARI_KOD: "YOK", TUTAR: "10.00" }),
    ).rejects.toMatchObject({ kind: "validation" });
    await expect(
      stub.receipts.createBankTransfer({ CARI_KOD: "YOK", TUTAR: "10.00" }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(stub.snapshot().collections).toHaveLength(0);
    expect(stub.snapshot().bankTransfers).toHaveLength(0);

    await stub.arps.create(arp);
    const collection = await stub.receipts.createCollection({
      CARI_KOD: "U10001",
      TUTAR: "-25.00",
    });
    const transfer = await stub.receipts.createBankTransfer({
      CARI_KOD: "U10001",
      TUTAR: "75.00",
    });
    expect(collection.ID).toMatch(/^STUB-TAH-\d+$/);
    expect(transfer.ID).toMatch(/^STUB-HVL-\d+$/);
    expect(stub.snapshot().collections[0]).toMatchObject({ TUTAR: "-25.00" });
  });

  it("guards queries exactly like the live client", async () => {
    await expect(stub.queries.select("SELECT 1 AS x")).resolves.toEqual([]);
    await expect(stub.queries.select("DROP TABLE x")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("pings as an authenticated stub and resets cleanly", async () => {
    await expect(stub.ping()).resolves.toEqual({
      mode: "stub",
      version: "stub",
      authenticated: true,
    });

    await seed();
    await stub.itemSlips.newEArchiveNumber("TRD");
    stub.reset();
    expect(stub.snapshot().arps).toEqual([]);
    await expect(stub.itemSlips.newEArchiveNumber("TRD")).resolves.toBe(
      `TRD${year}000000001`,
    );
  });
});
