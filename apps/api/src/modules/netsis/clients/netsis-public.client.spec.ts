import type { NetsisTransport } from "../http/netsis-transport";
import { NetsisPublicClient } from "./netsis-public.client";

describe("NetsisPublicClient", () => {
  const send = jest.fn();
  const client = new NetsisPublicClient({ send } as unknown as NetsisTransport);

  beforeEach(() => jest.resetAllMocks());

  it("pings without a bearer token", async () => {
    send.mockResolvedValue(null);

    await expect(client.ping()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith({ method: "GET", path: "public/Ping" });
  });

  it("reads the version as text", async () => {
    send.mockResolvedValueOnce("8.06.0012");
    await expect(client.version()).resolves.toBe("8.06.0012");
    expect(send).toHaveBeenCalledWith({
      method: "GET",
      path: "public/Version",
    });

    send.mockResolvedValueOnce({ Version: "9.0.1" });
    await expect(client.version()).resolves.toBe("9.0.1");
  });

  it("lists companies", async () => {
    send.mockResolvedValue([{ DbName: "TARODAN2026" }]);

    await expect(client.companyList()).resolves.toEqual([
      { DbName: "TARODAN2026" },
    ]);
    expect(send).toHaveBeenCalledWith({
      method: "GET",
      path: "public/CompanyList",
    });
  });

  it("lists authorized branches with company and username in the query", async () => {
    send.mockResolvedValue([]);

    await expect(
      client.authorizedBranches("TARODAN2026", "NETSIS"),
    ).resolves.toEqual([]);
    expect(send).toHaveBeenCalledWith({
      method: "GET",
      path: "public/AuthorizedBranches",
      query: { company: "TARODAN2026", username: "NETSIS" },
    });
  });

  it("rejects a list endpoint that does not return a list", async () => {
    send.mockResolvedValue({ not: "a list" });
    await expect(client.companyList()).rejects.toMatchObject({
      kind: "unknown",
    });
  });
});
