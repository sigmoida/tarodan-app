import type { NetsisHttpClient } from "../http/netsis-http.client";
import { NetsisTransactionsClient } from "./netsis-transactions.client";

describe("NetsisTransactionsClient", () => {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  const client = new NetsisTransactionsClient(
    http as unknown as NetsisHttpClient,
  );

  beforeEach(() => jest.resetAllMocks());

  it("opens with GET OpenTransaction, plain or wrapped id", async () => {
    http.get.mockResolvedValueOnce("TX-1");
    await expect(client.open()).resolves.toBe("TX-1");
    expect(http.get).toHaveBeenCalledWith("OpenTransaction");

    http.get.mockResolvedValueOnce({ TransId: 42 });
    await expect(client.open()).resolves.toBe("42");
  });

  it("commits and rolls back with ?transId= and without a session retry", async () => {
    http.get.mockResolvedValue(null);

    await client.commit("TX-1");
    await client.rollback("TX-2");

    expect(http.get).toHaveBeenNthCalledWith(
      1,
      "CommitTransaction",
      { transId: "TX-1" },
      { transactionId: "TX-1" },
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      "RollBackTransaction",
      { transId: "TX-2" },
      { transactionId: "TX-2" },
    );
  });

  it("withTransaction: open → fn(tx) → commit", async () => {
    http.get.mockImplementation(async (path: string) =>
      path === "OpenTransaction" ? "TX-9" : null,
    );
    http.post.mockResolvedValue({});

    const result = await client.withTransaction(async (tx) => {
      await http.post("ItemSlips", {}, tx);
      return "done";
    });

    expect(result).toBe("done");
    expect(http.post).toHaveBeenCalledWith("ItemSlips", {}, {
      transactionId: "TX-9",
    });
    expect(http.get.mock.calls.map(([path]) => path)).toEqual([
      "OpenTransaction",
      "CommitTransaction",
    ]);
  });

  it("withTransaction: rolls back and rethrows, even if the rollback fails", async () => {
    http.get.mockImplementation(async (path: string) => {
      if (path === "OpenTransaction") return "TX-9";
      if (path === "RollBackTransaction") throw new Error("rollback down");
      return null;
    });
    const failure = new Error("slip rejected");

    await expect(
      client.withTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(http.get.mock.calls.map(([path]) => path)).toEqual([
      "OpenTransaction",
      "RollBackTransaction",
    ]);
  });
});
