import { NetsisRequestException } from "../http/netsis-error";
import type { NetsisHttpClient } from "../http/netsis-http.client";
import type { NetsisItem } from "../helpers/netsis.types";
import { NetsisItemsClient } from "./netsis-items.client";

describe("NetsisItemsClient", () => {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const client = new NetsisItemsClient(http as unknown as NetsisHttpClient);
  const item: NetsisItem = {
    StokTemelBilgi: {
      STOK_KODU: "HZM-KOMISYON",
      STOK_ADI: "Pazaryeri komisyon hizmeti",
      KDV_ORANI: 20,
    },
  };
  const notFound = () =>
    new NetsisRequestException("configuration", 404, "GET Items → 404");

  beforeEach(() => jest.resetAllMocks());

  it("finds by STOK_KODU", async () => {
    http.get.mockResolvedValue(item);

    await expect(client.findByCode("HZM-KOMISYON")).resolves.toEqual(item);
    expect(http.get).toHaveBeenCalledWith(
      "Items/HZM-KOMISYON",
      undefined,
      undefined,
    );
  });

  it("creates with POST Items, returning the sent model on an empty body", async () => {
    http.post.mockResolvedValue(null);

    await expect(client.create(item)).resolves.toBe(item);
    expect(http.post).toHaveBeenCalledWith("Items", item, undefined);
  });

  describe("ensureServiceItem", () => {
    it("returns the existing card without creating", async () => {
      http.get.mockResolvedValue(item);

      await expect(client.ensureServiceItem(item)).resolves.toEqual(item);
      expect(http.post).not.toHaveBeenCalled();
    });

    it("creates a missing card", async () => {
      http.get.mockRejectedValue(notFound());
      http.post.mockResolvedValue(item);

      await expect(
        client.ensureServiceItem(item, { transactionId: "T" }),
      ).resolves.toEqual(item);
      expect(http.post).toHaveBeenCalledWith("Items", item, {
        transactionId: "T",
      });
    });

    it("resolves a creation race by re-reading the card", async () => {
      http.get.mockRejectedValueOnce(notFound()).mockResolvedValueOnce(item);
      http.post.mockRejectedValue(
        new NetsisRequestException("conflict", 400, "Stok kodu zaten var"),
      );

      await expect(client.ensureServiceItem(item)).resolves.toEqual(item);
      expect(http.get).toHaveBeenCalledTimes(2);
    });

    it("rethrows non-conflict failures and unexplained conflicts", async () => {
      http.get.mockRejectedValue(notFound());
      http.post.mockRejectedValueOnce(
        new NetsisRequestException("validation", 400, "KDV oranı geçersiz"),
      );
      await expect(client.ensureServiceItem(item)).rejects.toMatchObject({
        kind: "validation",
      });

      http.post.mockRejectedValueOnce(
        new NetsisRequestException("conflict", 409, "dup"),
      );
      await expect(client.ensureServiceItem(item)).rejects.toMatchObject({
        kind: "conflict",
      });
    });
  });
});
