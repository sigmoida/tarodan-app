import { PaymentCallbackService } from "./payment-callback.service";

/**
 * #71 — the outbound PayTR durum-sorgu triggered by a hash-mismatch callback is
 * rate-limited per merchant_oid so replayed forged callbacks cannot amplify into
 * unbounded outbound requests.
 */
describe("PaymentCallbackService.allowHashMismatchInquiry", () => {
  const anyDep = () =>
    new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) }) as any;

  function makeService(counts: number[]) {
    const config = { get: (_k: string) => undefined } as any; // defaults: window 60s, max 5
    let i = 0;
    const cache = {
      incr: jest.fn().mockImplementation(() => Promise.resolve(counts[i++])),
      set: jest.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new PaymentCallbackService(
      anyDep(),
      config,
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      cache,
    );
    return { svc, cache };
  }

  it("allows up to the per-window limit then blocks", async () => {
    const { svc } = makeService([1, 2, 3, 4, 5, 6]);
    const call = () => (svc as any).allowHashMismatchInquiry("OID-1");

    for (let n = 1; n <= 5; n++) {
      await expect(call()).resolves.toBe(true);
    }
    // 6th within the window is over the max → blocked
    await expect(call()).resolves.toBe(false);
  });

  it("sets the window TTL on the first hit only", async () => {
    const { svc, cache } = makeService([1, 2]);
    await (svc as any).allowHashMismatchInquiry("OID-2");
    await (svc as any).allowHashMismatchInquiry("OID-2");
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith("paytr:hashmismatch:OID-2", 1, {
      ttl: 60,
    });
  });
});
