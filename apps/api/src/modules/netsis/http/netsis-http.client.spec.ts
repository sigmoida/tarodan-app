import type { NetsisSessionService } from "../session/netsis-session.service";
import { NetsisHttpClient } from "./netsis-http.client";
import type { NetsisRequest, NetsisTransport } from "./netsis-transport";

describe("NetsisHttpClient", () => {
  const send = jest.fn(async (_request: NetsisRequest) => ({ ok: true }));
  const withSession = jest.fn(
    async <T>(
      call: (token: string) => Promise<T>,
      _options?: { retryOnUnauthorized?: boolean },
    ) => call("tok"),
  );
  const client = new NetsisHttpClient(
    { send } as unknown as NetsisTransport,
    { withSession } as unknown as NetsisSessionService,
  );

  beforeEach(() => jest.clearAllMocks());

  it("injects the shared bearer token into every call", async () => {
    await expect(client.get("ARPs/X", { fields: "CARI_KOD" })).resolves.toEqual(
      { ok: true },
    );
    expect(send).toHaveBeenCalledWith({
      method: "GET",
      path: "ARPs/X",
      query: { fields: "CARI_KOD" },
      bearerToken: "tok",
    });
    expect(withSession).toHaveBeenCalledWith(expect.any(Function), {
      retryOnUnauthorized: true,
    });
  });

  it("shapes POST, PUT and DELETE", async () => {
    await client.post("ItemSlips", { a: 1 });
    await client.put("ARPs/X", { b: 2 });
    await client.delete("MixedReceiptsMain/7");

    expect(send.mock.calls.map(([request]) => request)).toEqual([
      { method: "POST", path: "ItemSlips", body: { a: 1 }, bearerToken: "tok" },
      { method: "PUT", path: "ARPs/X", body: { b: 2 }, bearerToken: "tok" },
      { method: "DELETE", path: "MixedReceiptsMain/7", bearerToken: "tok" },
    ]);
  });

  it("carries the transaction id and disables the 401 re-login inside it", async () => {
    await client.post("ItemSlips", {}, { transactionId: "T-1" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "T-1" }),
    );
    expect(withSession).toHaveBeenCalledWith(expect.any(Function), {
      retryOnUnauthorized: false,
    });
  });
});
