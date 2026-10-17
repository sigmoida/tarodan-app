import { NetsisRequestException } from "../http/netsis-error";
import type { NetsisHttpClient } from "../http/netsis-http.client";
import { NetsisReceiptsClient } from "./netsis-receipts.client";

describe("NetsisReceiptsClient", () => {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const client = new NetsisReceiptsClient(http as unknown as NetsisHttpClient);

  beforeEach(() => jest.resetAllMocks());

  it("creates a collection with POST MixedReceiptsMain", async () => {
    const receipt = { CARI_KOD: "U10001", TUTAR: "120.00" };
    http.post.mockResolvedValue({ ...receipt, ID: 7 });

    await expect(
      client.createCollection(receipt, { transactionId: "T-1" }),
    ).resolves.toEqual({ ...receipt, ID: 7 });
    expect(http.post).toHaveBeenCalledWith("MixedReceiptsMain", receipt, {
      transactionId: "T-1",
    });
  });

  it("reads a collection by id, null when missing", async () => {
    http.get.mockResolvedValueOnce({ ID: 7 });
    await expect(client.getCollection("7")).resolves.toEqual({ ID: 7 });
    expect(http.get).toHaveBeenCalledWith(
      "MixedReceiptsMain/7",
      undefined,
      undefined,
    );

    http.get.mockRejectedValueOnce(
      new NetsisRequestException("configuration", 404, "404"),
    );
    await expect(client.getCollection("8")).resolves.toBeNull();
  });

  it("creates a bank transfer with POST BankRemittanceTransfer", async () => {
    const transfer = { TUTAR: 950, ACIKLAMA: "Satıcı ödemesi" };
    http.post.mockResolvedValue(null);

    await expect(client.createBankTransfer(transfer)).resolves.toBe(transfer);
    expect(http.post).toHaveBeenCalledWith(
      "BankRemittanceTransfer",
      transfer,
      undefined,
    );
  });
});
