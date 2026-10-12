import { NetsisRequestException } from "../http/netsis-error";
import type { NetsisHttpClient } from "../http/netsis-http.client";
import type { NetsisArp } from "../helpers/netsis.types";
import { NetsisArpsClient } from "./netsis-arps.client";

describe("NetsisArpsClient", () => {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const client = new NetsisArpsClient(http as unknown as NetsisHttpClient);
  const arp: NetsisArp = {
    CariTemelBilgi: {
      CARI_KOD: "U10001",
      CARI_ISIM: "Ayşe Yılmaz",
      VERGI_NUMARASI: "11111111111",
      CARI_IL: "İstanbul",
    },
    CariEkBilgi: { TCKIMLIKNO: "11111111111" },
  };

  beforeEach(() => jest.resetAllMocks());

  it("finds by CARI_KOD with an encoded path segment", async () => {
    http.get.mockResolvedValue(arp);

    await expect(client.findByCode("120 01/001")).resolves.toEqual(arp);
    expect(http.get).toHaveBeenCalledWith(
      "ARPs/120%2001%2F001",
      undefined,
      undefined,
    );
  });

  it("returns null when Netsis says the record does not exist", async () => {
    http.get.mockRejectedValueOnce(
      new NetsisRequestException("configuration", 404, "GET ARPs/X → 404"),
    );
    await expect(client.findByCode("X")).resolves.toBeNull();

    http.get.mockRejectedValueOnce(
      new NetsisRequestException(
        "validation",
        200,
        "GET ARPs/X → 200: Cari kayıt bulunamadı",
      ),
    );
    await expect(client.findByCode("X")).resolves.toBeNull();

    http.get.mockResolvedValueOnce(null);
    await expect(client.findByCode("X")).resolves.toBeNull();
  });

  it("does not hide other failures behind null", async () => {
    http.get.mockRejectedValueOnce(
      new NetsisRequestException("network", null, "down"),
    );
    await expect(client.findByCode("X")).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("creates with POST ARPs and passes the transaction through", async () => {
    http.post.mockResolvedValue(arp);

    await expect(client.create(arp, { transactionId: "T-1" })).resolves.toEqual(
      arp,
    );
    expect(http.post).toHaveBeenCalledWith("ARPs", arp, {
      transactionId: "T-1",
    });
  });

  it("updates with PUT ARPs/{code}", async () => {
    http.put.mockResolvedValue(arp);

    await client.update("U10001", arp);
    expect(http.put).toHaveBeenCalledWith("ARPs/U10001", arp, undefined);
  });

  it("refreshes e-invoice flags through EDocument/EDocCurrentUpdate", async () => {
    http.post.mockResolvedValue(null);

    await expect(client.refreshEInvoiceFlags("U10001")).resolves.toEqual({});
    expect(http.post).toHaveBeenCalledWith(
      "EDocument/EDocCurrentUpdate",
      { CARI_KOD: "U10001" },
      undefined,
    );

    await client.refreshEInvoiceFlags();
    expect(http.post).toHaveBeenLastCalledWith(
      "EDocument/EDocCurrentUpdate",
      {},
      undefined,
    );
  });

  it("refuses a non-object create response instead of returning garbage", async () => {
    http.post.mockResolvedValue("OK");
    await expect(client.create(arp)).rejects.toMatchObject({ kind: "unknown" });
  });
});
