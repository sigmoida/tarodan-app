/** @format */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const { permanentRedirect, queryClient } = vi.hoisted(() => ({
  permanentRedirect: vi.fn((_args: unknown): never => {
    throw new Error("NEXT_REDIRECT");
  }),
  queryClient: { current: null as unknown },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/i18n/navigation", () => ({ permanentRedirect }));
vi.mock("@/lib/query/server", () => ({
  getServerQueryClient: () => queryClient.current,
}));
vi.mock("@/lib/api/origin", () => ({
  getServerApiOrigin: () => "http://api.test",
}));
vi.mock("./ListingDetailClient", () => ({ default: () => null }));
vi.mock("./_sections/ProductStaticInfo", () => ({ default: () => null }));
vi.mock("./_sections/ProductStaticSpecs", () => ({ default: () => null }));

import ListingPage, { generateMetadata } from "./page";

const ID = "0b1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";
const TITLE = "Ferrari F40 1:18 Bburago Kırmızı";
const SLUG = "ferrari-f40-1-18-bburago-kirmizi";
const CANONICAL = `/listings/${SLUG}-${ID}`;
const PRODUCT = { id: ID, title: TITLE, price: 1500, images: [] };

const fetchMock = vi.fn();

/** The API answers the public product read; `status` 404 = not public. */
function apiAnswers(status = 200, body: unknown = { product: PRODUCT }) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function render(
  segment: string,
  locale = "tr",
  search: Record<string, string | string[] | undefined> = {},
) {
  return ListingPage({
    params: Promise.resolve({ id: segment, locale }),
    searchParams: Promise.resolve(search),
  });
}

function meta(segment: string, locale = "tr") {
  return generateMetadata({
    params: Promise.resolve({ id: segment, locale }),
    searchParams: Promise.resolve({}),
  });
}

beforeEach(() => {
  queryClient.current = new QueryClient();
  vi.stubGlobal("fetch", fetchMock);
  apiAnswers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  permanentRedirect.mockClear();
});

describe("listing page: redirect matrix (ADR 0017)", () => {
  it("the canonical URL renders, with no redirect, and seeds the cache", async () => {
    await render(`${SLUG}-${ID}`);
    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.test/api/products/${ID}`,
      expect.objectContaining({
        next: expect.objectContaining({ tags: [`product:${ID}`] }),
      }),
    );
    expect(
      (queryClient.current as QueryClient).getQueryData(["listing", ID]),
    ).toEqual(PRODUCT);
  });

  it.each([
    ["bare UUID", ID],
    ["stale slug", `old-title-${ID}`],
    ["upper-case UUID", ID.toUpperCase()],
    ["upper-case slug", `${SLUG.toUpperCase()}-${ID}`],
  ])("%s: 308 to the canonical path", async (_case, segment) => {
    await expect(render(segment)).rejects.toThrow("NEXT_REDIRECT");
    expect(permanentRedirect).toHaveBeenCalledWith({
      href: CANONICAL,
      locale: "tr",
    });
    // The API is always asked by the lower-cased UUID (one cache tag per listing).
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.test/api/products/${ID}`,
      expect.anything(),
    );
  });

  it("keeps the locale and the query string", async () => {
    await expect(
      render(ID, "en", { boost: "1", utm_source: "mail", tag: ["a", "b"] }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(permanentRedirect).toHaveBeenCalledWith({
      href: {
        pathname: CANONICAL,
        query: { boost: "1", utm_source: "mail", tag: ["a", "b"] },
      },
      locale: "en",
    });
  });

  it.each([
    ["not a UUID", "not-a-listing"],
    ["slug without UUID", SLUG],
    ["UUID with trailing junk", `${ID}x`],
  ])("%s: 404 without asking the API", async (_case, segment) => {
    await expect(render(segment)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("a non-public listing (owner, pending) renders at any URL, no redirect", async () => {
    apiAnswers(404, {});
    await render(ID);
    await render(`old-title-${ID}`);
    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(
      (queryClient.current as QueryClient).getQueryData(["listing", ID]),
    ).toBeUndefined();
  });

  it("an API outage renders the client fallback instead of redirecting", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await render(ID);
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});

describe("listing page: metadata", () => {
  it("tr: canonical, hreflang and og:url name the canonical URL", async () => {
    const m = await meta(`${SLUG}-${ID}`);
    expect(m.alternates).toEqual({
      canonical: CANONICAL,
      languages: {
        tr: CANONICAL,
        en: `/en${CANONICAL}`,
        "x-default": CANONICAL,
      },
    });
    expect(m.openGraph?.url).toBe(CANONICAL);
  });

  it("en: the canonical keeps the /en prefix", async () => {
    const m = await meta(`${SLUG}-${ID}`, "en");
    expect(m.alternates?.canonical).toBe(`/en${CANONICAL}`);
    expect(m.openGraph?.url).toBe(`/en${CANONICAL}`);
  });

  it("a bare or stale request still names the canonical URL", async () => {
    expect((await meta(ID)).alternates?.canonical).toBe(CANONICAL);
    expect((await meta(`old-${ID}`)).alternates?.canonical).toBe(CANONICAL);
  });

  it("an unparseable segment or a non-public listing gets the not-found title only", async () => {
    expect(await meta("nope")).toEqual({
      title: "page.listings.page.ilanBulunamadiTarodan",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    apiAnswers(404, {});
    expect(await meta(ID)).toEqual({
      title: "page.listings.page.ilanBulunamadiTarodan",
    });
  });
});
