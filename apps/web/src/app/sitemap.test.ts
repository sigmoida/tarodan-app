/** @format */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/origin", () => ({
  getServerApiOrigin: () => "http://api.test",
}));

import sitemap from "./sitemap";
import { SITE_URL } from "@/lib/seo";

const fetchMock = vi.fn();

/** A UUID whose last block encodes `n`, so every listing is distinct. */
const uuid = (n: number) =>
  `0b1e2f3a-4b5c-4d6e-8f70-${n.toString(16).padStart(12, "0")}`;

/** `GET /api/products` with `totalPages` pages of `perPage` listings each. */
function catalogue(
  totalPages: number,
  perPage = 2,
  fail: (page: number) => boolean = () => false,
) {
  fetchMock.mockImplementation(async (url: string) => {
    const page = Number(new URL(url).searchParams.get("page"));
    if (fail(page)) return { ok: false, status: 500, json: async () => ({}) };
    const data = Array.from({ length: perPage }, (_, i) => {
      const n = (page - 1) * perPage + i + 1;
      return {
        id: uuid(n),
        title: `Model ${n}`,
        updatedAt: "2026-10-01T00:00:00Z",
      };
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data,
        meta: { total: totalPages * perPage, page, limit: 100, totalPages },
      }),
    };
  });
}

const requested = () =>
  fetchMock.mock.calls.map(([url]) => new URL(url as string));

const listingUrls = (entries: Awaited<ReturnType<typeof sitemap>>) =>
  entries.map((e) => e.url).filter((u) => u.includes("/listings/"));

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("sitemap: listings", () => {
  it("pages through the API within its 100-per-page cap (no 400)", async () => {
    catalogue(3);
    const entries = await sitemap();
    const urls = requested();
    expect(urls.map((u) => u.searchParams.get("page"))).toEqual([
      "1",
      "2",
      "3",
    ]);
    for (const u of urls) {
      expect(u.pathname).toBe("/api/products");
      expect(u.searchParams.get("limit")).toBe("100");
      expect(u.searchParams.get("status")).toBe("active");
      expect(u.searchParams.get("sortBy")).toBe("created_desc");
    }
    expect(listingUrls(entries)).toHaveLength(6);
  });

  it("emits canonical slug URLs with hreflang alternates", async () => {
    catalogue(1, 1);
    const [entry] = (await sitemap()).filter((e) =>
      e.url.includes("/listings/"),
    );
    const path = `/listings/model-1-${uuid(1)}`;
    expect(entry.url).toBe(`${SITE_URL}${path}`);
    expect(entry.alternates?.languages).toEqual({
      tr: `${SITE_URL}${path}`,
      en: `${SITE_URL}/en${path}`,
      "x-default": `${SITE_URL}${path}`,
    });
    expect(entry.lastModified).toEqual(new Date("2026-10-01T00:00:00Z"));
  });

  it("stops at the page cap however large the catalogue is", async () => {
    catalogue(500);
    await sitemap();
    expect(fetchMock).toHaveBeenCalledTimes(50);
  });

  it("skips a failed page and keeps the rest", async () => {
    catalogue(3, 2, (page) => page === 2);
    expect(listingUrls(await sitemap())).toHaveLength(4);
  });

  it("a failed first page leaves the static sitemap only", async () => {
    catalogue(3, 2, () => true);
    const entries = await sitemap();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listingUrls(entries)).toEqual([]);
    expect(entries.map((e) => e.url)).toContain(`${SITE_URL}/listings`);
  });

  it("an unreachable API leaves the static sitemap only", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(listingUrls(await sitemap())).toEqual([]);
  });

  it("drops a listing repeated across pages (a page shift mid-build)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      const data =
        page === 1
          ? [
              { id: uuid(1), title: "A" },
              { id: uuid(2), title: "B" },
            ]
          : [
              { id: uuid(2), title: "B" },
              { id: uuid(3), title: "C" },
            ];
      return {
        ok: true,
        json: async () => ({ data, meta: { totalPages: 2 } }),
      };
    });
    expect(listingUrls(await sitemap())).toHaveLength(3);
  });
});

describe("sitemap: static pages", () => {
  it("keep their hreflang alternates (root included)", async () => {
    catalogue(1, 0);
    const root = (await sitemap()).find((e) => e.url === SITE_URL);
    expect(root?.alternates?.languages).toEqual({
      tr: SITE_URL,
      en: `${SITE_URL}/en`,
      "x-default": SITE_URL,
    });
  });
});
