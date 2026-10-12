import { NETSIS_SLIP_BY_TRACKING_KEY_SQL } from "../helpers/netsis.constants";
import { NetsisRequestException } from "../http/netsis-error";
import type { NetsisHttpClient } from "../http/netsis-http.client";
import type {
  NetsisItemSlip,
  NetsisItemSlipKey,
} from "../helpers/netsis.types";
import { NetsisItemSlipsClient } from "./netsis-item-slips.client";
import { NetsisQueriesClient } from "./netsis-queries.client";

describe("NetsisItemSlipsClient", () => {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  // Gerçek sorgu istemcisi aynı sahte HTTP üzerinden: bağlanan SQL görünür.
  const client = new NetsisItemSlipsClient(
    http as unknown as NetsisHttpClient,
    new NetsisQueriesClient(http as unknown as NetsisHttpClient),
  );
  const slip: NetsisItemSlip = {
    FaturaTip: "ftSFat",
    FatUst: {
      FATIRS_NO: "TRD2026000000001",
      CARI_KODU: "U10001",
      TARIH: "2026-10-12",
    },
    Kalems: [
      {
        STOK_KODU: "HZM-KOMISYON",
        STHAR_GCMIK: 1,
        STHAR_NF: "100.00",
        STHAR_KDV: 20,
      },
    ],
  };
  const key: NetsisItemSlipKey = {
    FaturaTip: "ftSFat",
    FATIRS_NO: "TRD2026000000001",
    CARI_KODU: "U10001",
  };

  beforeEach(() => jest.resetAllMocks());

  it("creates with POST ItemSlips inside the given transaction", async () => {
    http.post.mockResolvedValue(slip);

    await expect(
      client.create(slip, { transactionId: "T-1" }),
    ).resolves.toEqual(slip);
    expect(http.post).toHaveBeenCalledWith("ItemSlips", slip, {
      transactionId: "T-1",
    });
  });

  it("reads details by key and maps a missing slip to null", async () => {
    http.post.mockResolvedValueOnce(slip);
    await expect(client.details(key)).resolves.toEqual(slip);
    expect(http.post).toHaveBeenCalledWith("ItemSlips/Details", key, undefined);

    http.post.mockRejectedValueOnce(
      new NetsisRequestException("validation", 200, "Fatura bulunamadı"),
    );
    await expect(client.details(key)).resolves.toBeNull();
  });

  it("calculates totals with POST ItemSlips/Calculate as Decimals", async () => {
    http.post.mockResolvedValue({
      ...slip,
      FatUst: { ...slip.FatUst, GENELTOPLAM: 120, KDV: "20.00" },
    });

    const totals = await client.calculate(slip);

    expect(http.post).toHaveBeenCalledWith(
      "ItemSlips/Calculate",
      slip,
      undefined,
    );
    expect(totals.grossAmount.toFixed(2)).toBe("120.00");
    expect(totals.vatAmount.toFixed(2)).toBe("20.00");
    expect(totals.netAmount.toFixed(2)).toBe("100.00");
  });

  it("returns the invoice HTML as plain text or from a wrapper field", async () => {
    http.post.mockResolvedValueOnce("<html>a</html>");
    await expect(client.html(key)).resolves.toBe("<html>a</html>");
    expect(http.post).toHaveBeenCalledWith("ItemSlips/Html", key, undefined);

    http.post.mockResolvedValueOnce({ Html: "<html>b</html>" });
    await expect(client.html(key)).resolves.toBe("<html>b</html>");
  });

  it("requests a new e-invoice number for a serial", async () => {
    http.post.mockResolvedValue("TRD2026000000007");

    await expect(client.newEInvoiceNumber("TRD")).resolves.toBe(
      "TRD2026000000007",
    );
    expect(http.post).toHaveBeenCalledWith(
      "ItemSlips/NewEItemSlipsNumber",
      { SERI: "TRD" },
      undefined,
    );
  });

  it("requests a new e-archive number with the serial in the path", async () => {
    http.get.mockResolvedValue({ FATIRS_NO: "EAR2026000000003" });

    await expect(client.newEArchiveNumber("EAR")).resolves.toBe(
      "EAR2026000000003",
    );
    expect(http.get).toHaveBeenCalledWith(
      "ItemSlips/NewEArchiveNumber/EAR",
      undefined,
      undefined,
    );
  });

  it("fails loudly when a number response has no recognisable number", async () => {
    http.get.mockResolvedValue({ Unexpected: true });
    await expect(client.newEArchiveNumber("EAR")).rejects.toMatchObject({
      kind: "unknown",
    });
  });

  it("deletes by key with POST ItemSlips/Delete", async () => {
    http.post.mockResolvedValue(null);

    await expect(
      client.delete(key, { transactionId: "T-2" }),
    ).resolves.toBeUndefined();
    expect(http.post).toHaveBeenCalledWith("ItemSlips/Delete", key, {
      transactionId: "T-2",
    });
  });

  describe("findByTrackingKey", () => {
    const ettn = "11111111-2222-4333-8444-555555555555";

    it("runs the read-only lookup through Queries with the key bound as a literal", async () => {
      http.post.mockResolvedValue([
        { FATIRS_NO: "EAR2026000000001 ", FTIRSIP: "1" },
      ]);

      await expect(client.findByTrackingKey(ettn)).resolves.toEqual({
        FaturaTip: "ftSFat",
        FATIRS_NO: "EAR2026000000001",
      });
      expect(http.post).toHaveBeenCalledTimes(1);
      expect(http.post).toHaveBeenCalledWith("Queries", {
        Query: NETSIS_SLIP_BY_TRACKING_KEY_SQL.replace(
          "@trackingKey",
          `N'${ettn}'`,
        ),
      });
    });

    it("maps the return slip type and takes the first (oldest) of several rows", async () => {
      http.post.mockResolvedValue([
        { FATIRS_NO: "EAR2026000000002", FTIRSIP: 2 },
        { FATIRS_NO: "EAR2026000000003", FTIRSIP: 2 },
      ]);
      await expect(client.findByTrackingKey(ettn)).resolves.toEqual({
        FaturaTip: "ftAFat",
        FATIRS_NO: "EAR2026000000002",
      });
    });

    it("returns null when Netsis has no such slip", async () => {
      http.post.mockResolvedValue([]);
      await expect(client.findByTrackingKey(ettn)).resolves.toBeNull();
    });

    it("never queries with a blank key (it would match foreign slips)", async () => {
      await expect(client.findByTrackingKey("  ")).resolves.toBeNull();
      expect(http.post).not.toHaveBeenCalled();
    });

    it("escapes quotes in the key instead of concatenating it", async () => {
      http.post.mockResolvedValue([]);
      await client.findByTrackingKey("x' OR 1=1");
      expect(http.post).toHaveBeenCalledWith("Queries", {
        Query: expect.stringContaining("EKACK1 = N'x'' OR 1=1'"),
      });
    });

    it("an unreadable row is an error, never 'not found'", async () => {
      http.post.mockResolvedValue([{ FATIRS_NO: "EAR1", FTIRSIP: "9" }]);
      await expect(client.findByTrackingKey(ettn)).rejects.toMatchObject({
        kind: "unknown",
      });
    });
  });
});
