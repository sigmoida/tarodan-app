import type { NetsisHttpClient } from "../http/netsis-http.client";
import type { NetsisEDocumentRequest } from "../helpers/netsis.types";
import { NetsisEDocumentClient } from "./netsis-edocument.client";

describe("NetsisEDocumentClient", () => {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const client = new NetsisEDocumentClient(http as unknown as NetsisHttpClient);
  const request: NetsisEDocumentRequest = {
    FaturaTip: "ftSFat",
    FATIRS_NO: "TRD2026000000001",
    CARI_KODU: "U10001",
  };
  const ettn = "1b4e28ba-2fa1-4d2b-883f-0016d3cca427";

  beforeEach(() => jest.resetAllMocks());

  it("sends with POST EDocument/SendEDocument and reads the ETTN", async () => {
    http.post.mockResolvedValue({ ETTN: ettn });

    await expect(
      client.send(request, { transactionId: "T-1" }),
    ).resolves.toEqual({ ettn, raw: { ETTN: ettn } });
    expect(http.post).toHaveBeenCalledWith("EDocument/SendEDocument", request, {
      transactionId: "T-1",
    });
  });

  it("keeps a scalar send response in raw and reports no ETTN", async () => {
    http.post.mockResolvedValue(true);

    await expect(client.send(request)).resolves.toEqual({
      ettn: null,
      raw: { Result: true },
    });
  });

  it("checks with POST EDocument/CheckEDocument and normalises the state", async () => {
    http.post.mockResolvedValue({ Durum: "Kabul edildi" });

    await expect(client.check({ ...request, ETTN: ettn })).resolves.toEqual({
      state: "accepted",
      ettn,
      raw: { Durum: "Kabul edildi" },
    });
    expect(http.post).toHaveBeenCalledWith(
      "EDocument/CheckEDocument",
      { ...request, ETTN: ettn },
      undefined,
    );
  });

  it("never reports an unrecognised state as accepted", async () => {
    http.post.mockResolvedValue({ Something: "else" });
    await expect(client.check(request)).resolves.toMatchObject({
      state: "unknown",
      ettn: null,
    });
  });

  it("cancels an e-archive invoice", async () => {
    http.post.mockResolvedValue(null);

    await expect(client.cancelEArchive(request)).resolves.toBeUndefined();
    expect(http.post).toHaveBeenCalledWith(
      "EDocument/EArchiveCancellationInvoice",
      request,
      undefined,
    );
  });

  it("shows the document HTML", async () => {
    http.post.mockResolvedValue("<html>e-fatura</html>");

    await expect(client.show(request)).resolves.toBe("<html>e-fatura</html>");
    expect(http.post).toHaveBeenCalledWith(
      "EDocument/ShowEDocument",
      request,
      undefined,
    );
  });
});
