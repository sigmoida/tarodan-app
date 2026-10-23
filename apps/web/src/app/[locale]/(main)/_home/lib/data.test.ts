import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";
import {
  HOME_RAIL_RETRY_DELAY_MS,
  HOME_RAIL_RETRY_HEADER,
  PRODUCTS_LIST_TAG,
  RailHttpError,
  fetchProductRail,
  loadHomePageData,
  resolveHomeRails,
} from "./data";

const product = (id: string, over: Partial<Product> = {}) =>
  ({ id, title: id, price: 10, ...over }) as Product;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const timeoutError = () =>
  new DOMException("The operation was aborted due to timeout", "TimeoutError");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Only the retry pause is faked; AbortSignal.timeout keeps real timers.
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs a call to completion, skipping the retry pause. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  await vi.runAllTimersAsync();
  return promise;
}

describe("fetchProductRail", () => {
  it("tags the fetch with products:list and a timeout signal", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [product("a")] }));

    await expect(
      fetchProductRail("/products/popular", { limit: 20, page: 1 }),
    ).resolves.toEqual([product("a")]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/products\/popular\?limit=20&page=1$/);
    expect(init?.next).toEqual({ revalidate: 60, tags: [PRODUCTS_LIST_TAG] });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries once on a 5xx after a pause and returns the second answer", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: "boom" }, 500))
      .mockResolvedValueOnce(json([product("a")]));

    const result = fetchProductRail("/products", { page: 1 });
    await vi.advanceTimersByTimeAsync(HOME_RAIL_RETRY_DELAY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(settle(result)).resolves.toEqual([product("a")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry is a distinct fetch for Next's dedupe and data cache.
    expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined();
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({
      [HOME_RAIL_RETRY_HEADER]: "1",
    });
  });

  it("retries once on a timeout", async () => {
    fetchMock
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(json([product("a")]));

    await expect(
      settle(fetchProductRail("/products", { page: 1 })),
    ).resolves.toEqual([product("a")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json([product("a")]));

    await expect(
      settle(fetchProductRail("/products", { page: 1 })),
    ).resolves.toEqual([product("a")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    fetchMock.mockResolvedValue(json({ message: "nope" }, 404));

    const error = await settle(
      fetchProductRail("/products", { page: 1 }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RailHttpError);
    expect(error).toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unreadable body", async () => {
    fetchMock.mockResolvedValue(new Response("<html>proxy</html>"));

    await expect(
      settle(fetchProductRail("/products", { page: 1 })),
    ).rejects.toThrow(SyntaxError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws after two failed attempts", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 503))
      .mockRejectedValueOnce(timeoutError());

    await expect(
      settle(fetchProductRail("/products", { page: 1 })),
    ).rejects.toThrow(/timeout/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolveHomeRails", () => {
  const ok = (value: Product[]): PromiseFulfilledResult<Product[]> => ({
    status: "fulfilled",
    value,
  });
  const failed: PromiseRejectedResult = {
    status: "rejected",
    reason: new RailHttpError("/products", 500),
  };

  it("seeds a failed rail with null and logs it", () => {
    expect(
      resolveHomeRails({
        featured: ok([product("a")]),
        trade: failed,
        discounted: ok([]),
        popular: failed,
      }),
    ).toEqual({
      featured: [product("a")],
      trade: null,
      discounted: [],
      popular: null,
    });
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("keeps a successful empty answer as an empty rail", () => {
    expect(
      resolveHomeRails({
        featured: ok([]),
        trade: ok([]),
        discounted: ok([]),
        popular: ok([]),
      }),
    ).toEqual({ featured: [], trade: [], discounted: [], popular: [] });
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("loadHomePageData", () => {
  it("never throws: a rail that keeps failing gets a null seed", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products/popular")
        ? json({ message: "boom" }, 500)
        : json([]),
    );

    await expect(settle(loadHomePageData())).resolves.toMatchObject({
      featured: [],
      trade: [],
      discounted: [],
      popular: null,
    });
  });

  it("asks each rail for its own list and keeps real discounts only", async () => {
    const onSale = product("sale", { price: 80, oldPrice: 100 });
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products")
        ? json([product("a"), onSale])
        : json([]),
    );

    const data = await settle(loadHomePageData());
    expect(data.discounted).toEqual([onSale]);
    expect(data.popular).toEqual([product("a"), onSale]);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/api\/products\?.*homeShowcase=true/),
        expect.stringMatching(/\/api\/products\?.*tradeOnly=true/),
        expect.stringMatching(/\/api\/products\?.*discountOnly=true/),
        expect.stringMatching(/\/api\/products\/popular\?/),
      ]),
    );
  });

  it("keeps the optional sections on their fallback", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/products")
        ? json([product("a")])
        : json({ message: "boom" }, 500),
    );

    await expect(settle(loadHomePageData())).resolves.toMatchObject({
      featured: [product("a")],
      popular: [product("a")],
      marqueeItems: [],
      topCollections: [],
      featuredCollector: null,
      featuredBusiness: null,
      heroSlides: [],
      trustBadges: [],
    });
  });
});
