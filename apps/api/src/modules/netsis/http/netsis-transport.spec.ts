import type { NetsisConfig } from "../../../config/netsis";
import { NetsisRequestException } from "./netsis-error";
import { NetsisTransport } from "./netsis-transport";

const NETSIS_TEST_CONFIG: NetsisConfig = {
  enabled: true,
  mode: "live",
  baseUrl: "https://netsis.test:7070",
  username: "NETSIS",
  password: "user-secret",
  dbName: "TARODAN2026",
  dbUser: "TEMELSET",
  dbPassword: "db-secret",
  dbType: "vtMSSQL",
  branchCode: "0",
  timeoutMs: 15_000,
  tokenSafetySeconds: 60,
};

describe("NetsisTransport", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  const respond = (status: number, body: string) => {
    fetchMock.mockResolvedValue({
      status,
      text: jest.fn().mockResolvedValue(body),
    });
  };
  const lastCall = (): [string, RequestInit] =>
    fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
      string,
      RequestInit,
    ];

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  const transport = (overrides: Partial<NetsisConfig> = {}) =>
    new NetsisTransport({ ...NETSIS_TEST_CONFIG, ...overrides });

  it("prefixes api/v2, sets the query, the bearer and a JSON body", async () => {
    respond(200, '{"CARI_KOD":"120.01.001"}');

    await expect(
      transport().send({
        method: "POST",
        path: "ARPs",
        query: { limit: 10, skip: undefined },
        body: { a: 1 },
        bearerToken: "tok",
      }),
    ).resolves.toEqual({ CARI_KOD: "120.01.001" });

    const [url, init] = lastCall();
    expect(url).toBe("https://netsis.test:7070/api/v2/ARPs?limit=10");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer tok",
    });
  });

  it("sends a form body url-encoded (token endpoint)", async () => {
    respond(200, '{"access_token":"x"}');

    await transport().send({
      method: "POST",
      path: "token",
      form: { grant_type: "password", username: "a b" },
    });

    const [, init] = lastCall();
    expect(init.body).toBe("grant_type=password&username=a+b");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });

  it("attaches the transaction id as the transId query parameter", async () => {
    respond(200, "{}");

    await transport().send({
      method: "POST",
      path: "ItemSlips",
      body: {},
      transactionId: "T-9",
    });

    expect(lastCall()[0]).toBe(
      "https://netsis.test:7070/api/v2/ItemSlips?transId=T-9",
    );
  });

  it("unwraps a successful NetOpenX envelope to its Data", async () => {
    respond(200, '{"IsSuccessful":true,"Data":{"FATIRS_NO":"TRD1"}}');
    await expect(
      transport().send({ method: "GET", path: "ItemSlips/1" }),
    ).resolves.toEqual({ FATIRS_NO: "TRD1" });
  });

  it("turns a failed 200 envelope into a classified exception", async () => {
    respond(
      200,
      '{"IsSuccessful":false,"ErrorCode":"E12","ErrorDesc":"Bu numara zaten kullanılmış"}',
    );

    const error = await transport()
      .send({ method: "POST", path: "ItemSlips", body: {} })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetsisRequestException);
    expect(error).toMatchObject({ kind: "conflict", upstreamStatus: 200 });
    expect((error as NetsisRequestException).detail).toContain(
      "E12 Bu numara zaten kullanılmış",
    );
  });

  it("classifies HTTP errors without leaking the request body", async () => {
    respond(400, '{"error":"invalid_grant"}');

    const error = (await transport()
      .send({
        method: "POST",
        path: "token",
        form: { password: "user-secret" },
      })
      .catch((e: unknown) => e)) as NetsisRequestException;

    expect(error.kind).toBe("auth");
    expect(error.upstreamStatus).toBe(400);
    expect(error.detail).not.toContain("user-secret");
  });

  it("returns null for an empty body and raw text for non-JSON (HTML)", async () => {
    respond(200, "");
    await expect(
      transport().send({ method: "GET", path: "revoke" }),
    ).resolves.toBeNull();

    respond(200, "<html>fatura</html>");
    await expect(
      transport().send({ method: "POST", path: "ItemSlips/Html", body: {} }),
    ).resolves.toBe("<html>fatura</html>");
  });

  it("maps a connection failure to a network exception", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("refused"), { code: "ECONNREFUSED" }),
      }),
    );

    await expect(
      transport().send({ method: "GET", path: "ping" }),
    ).rejects.toMatchObject({ kind: "network", upstreamStatus: null });
  });

  it("aborts after the configured timeout and reports it as network", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const abort = new Error("aborted");
            abort.name = "AbortError";
            reject(abort);
          });
        }),
    );

    const pending = transport({ timeoutMs: 1000 })
      .send({ method: "GET", path: "ping" })
      .catch((e: unknown) => e);
    jest.advanceTimersByTime(1000);

    await expect(pending).resolves.toMatchObject({ kind: "network" });
  });

  it("refuses to call anything without a base URL", async () => {
    const error = (await transport({ baseUrl: "" })
      .send({ method: "GET", path: "ping" })
      .catch((e: unknown) => e)) as NetsisRequestException;

    expect(error.kind).toBe("configuration");
    expect(error.getResponse()).toEqual({
      i18nKey: "server.netsis.notConfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
