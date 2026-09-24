import {
  isRetryableNetworkError,
  networkErrorReason,
  withPaytrFetchRetry,
} from "./paytr-fetch-retry.util";

/**
 * Sentry evidence (release e9bcb90): a single overnight "fetch failed" network
 * blip in payout-check-returned / paytr-statement-sync should be absorbed by
 * a couple of retries — the next cron run already succeeded on its own, so a
 * short in-place retry avoids a false alarm for something transient.
 */
describe("withPaytrFetchRetry", () => {
  const okResponse = (status = 200) =>
    ({ status, text: async () => "{}" }) as unknown as Response;

  it("returns the first success without retrying", async () => {
    const fn = jest.fn().mockResolvedValue(okResponse(200));

    const response = await withPaytrFetchRetry(fn, { delaysMs: [0, 0] });

    expect(response.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on a network-level 'fetch failed' error and eventually succeeds", async () => {
    const networkError = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(okResponse(200));

    const response = await withPaytrFetchRetry(fn, { delaysMs: [0, 0] });

    expect(response.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on HTTP 5xx and eventually succeeds", async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce(okResponse(502))
      .mockResolvedValueOnce(okResponse(200));

    const response = await withPaytrFetchRetry(fn, { delaysMs: [0, 0] });

    expect(response.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx response", async () => {
    const fn = jest.fn().mockResolvedValue(okResponse(400));

    const response = await withPaytrFetchRetry(fn, { delaysMs: [0, 0] });

    expect(response.status).toBe(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-network error (e.g. a thrown BadRequestException-like error)", async () => {
    const businessError = new Error("PayTR err_msg: gecersiz token");
    const fn = jest.fn().mockRejectedValue(businessError);

    await expect(withPaytrFetchRetry(fn, { delaysMs: [0, 0] })).rejects.toThrow(
      "gecersiz token",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured number of retries and throws the last error", async () => {
    const networkError = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ETIMEDOUT" },
    });
    const fn = jest.fn().mockRejectedValue(networkError);

    await expect(
      withPaytrFetchRetry(fn, { delaysMs: [0, 0], retries: 2 }),
    ).rejects.toBe(networkError);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("gives up after retries are exhausted on persistent 5xx", async () => {
    const fn = jest.fn().mockResolvedValue(okResponse(503));

    const response = await withPaytrFetchRetry(fn, {
      delaysMs: [0, 0],
      retries: 2,
    });

    expect(response.status).toBe(503);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries an AbortError from AbortSignal.timeout", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fn = jest
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(okResponse(200));

    const response = await withPaytrFetchRetry(fn, { delaysMs: [0, 0] });

    expect(response.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("isRetryableNetworkError", () => {
  it("treats TypeError('fetch failed') as retryable", () => {
    expect(isRetryableNetworkError(new TypeError("fetch failed"))).toBe(true);
  });

  it("treats known cause.code values as retryable", () => {
    for (const code of [
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNREFUSED",
    ]) {
      const error = Object.assign(new Error("network"), { cause: { code } });
      expect(isRetryableNetworkError(error)).toBe(true);
    }
  });

  it("treats a generic business error as non-retryable", () => {
    expect(isRetryableNetworkError(new Error("gecersiz token"))).toBe(false);
  });

  it("treats a non-Error value as non-retryable", () => {
    expect(isRetryableNetworkError("boom")).toBe(false);
  });
});

describe("networkErrorReason", () => {
  it("includes cause.code in the message so the real network reason is visible", () => {
    const error = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    expect(networkErrorReason(error)).toBe("fetch failed (ECONNRESET)");
  });

  it("falls back to the bare message when there is no cause.code", () => {
    expect(networkErrorReason(new Error("gecersiz token"))).toBe(
      "gecersiz token",
    );
  });
});
