import {
  APPLE_REQUEST_TIMEOUT_MS,
  appleErrorCode,
  postAppleEndpoint,
} from "./apple-id-endpoint";

/**
 * Apple kimlik uçları: karar yalnız HTTP durumuna dayanır ve çağrı süre
 * sınırlıdır (yavaş Apple ne girişi ne outbox drainer'ını tutar).
 */
describe("postAppleEndpoint", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  const reply = (status: number, text: string) =>
    jest.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      text: async () => text,
    });

  it("2xx boş gövde → ok, body null", async () => {
    global.fetch = reply(200, "") as never;
    await expect(
      postAppleEndpoint("/auth/revoke", { token: "t" }),
    ).resolves.toEqual({ status: 200, ok: true, body: null });
  });

  it("5xx boş gövde → ok DEĞİL", async () => {
    global.fetch = reply(503, "") as never;
    const res = await postAppleEndpoint("/auth/revoke", { token: "t" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it("hata gövdesinden OAuth kodu okunur; JSON olmayan gövde null", async () => {
    global.fetch = reply(400, '{"error":"invalid_grant"}') as never;
    const res = await postAppleEndpoint("/auth/token", { code: "c" });
    expect(appleErrorCode(res)).toBe("invalid_grant");

    global.fetch = reply(502, "<html>bad gateway</html>") as never;
    const html = await postAppleEndpoint("/auth/token", { code: "c" });
    expect(html.body).toBeNull();
    expect(appleErrorCode(html)).toBeNull();
  });

  it("form olarak appleid.apple.com'a POST eder", async () => {
    const fetchMock = reply(200, "");
    global.fetch = fetchMock as never;

    await postAppleEndpoint("/auth/revoke", { client_id: "com.tarodan.app" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://appleid.apple.com/auth/revoke");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(String(init.body)).toBe("client_id=com.tarodan.app");
  });

  it(`süre (${APPLE_REQUEST_TIMEOUT_MS} ms) dolunca istek iptal edilir`, async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: unknown, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new Error("This operation was aborted")),
          );
        }),
    ) as never;

    const pending = postAppleEndpoint("/auth/revoke", { token: "t" });
    jest.advanceTimersByTime(APPLE_REQUEST_TIMEOUT_MS);

    await expect(pending).rejects.toThrow(/aborted/);
  });
});
