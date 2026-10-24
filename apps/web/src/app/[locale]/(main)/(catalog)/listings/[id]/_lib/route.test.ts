/** @format */

import { describe, expect, it } from "vitest";
import { canonicalListingPath, canonicalRedirectHref } from "./route";

const ID = "0b1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";
const TITLE = "Ferrari F40 1:18 Bburago Kırmızı";
const SLUG = "ferrari-f40-1-18-bburago-kirmizi";
const CANONICAL = `/listings/${SLUG}-${ID}`;

describe("canonicalListingPath", () => {
  const listing = { id: ID, title: TITLE };

  it("the canonical segment does not redirect (no loop)", () => {
    expect(canonicalListingPath(`${SLUG}-${ID}`, listing)).toBeNull();
  });

  it.each([
    ["bare UUID", ID],
    ["upper-case UUID", ID.toUpperCase()],
    ["stale slug after a title edit", `ferrari-f40-old-title-${ID}`],
    ["upper-case slug", `${SLUG.toUpperCase()}-${ID}`],
    ["upper-case UUID behind the right slug", `${SLUG}-${ID.toUpperCase()}`],
    ["slug cut short", `ferrari-${ID}`],
  ])("%s redirects to the canonical path", (_case, segment) => {
    expect(canonicalListingPath(segment, listing)).toBe(CANONICAL);
  });

  it("a title with no slug is canonical as the bare UUID", () => {
    const untitled = { id: ID, title: "!!!" };
    expect(canonicalListingPath(ID, untitled)).toBeNull();
    expect(canonicalListingPath(`old-title-${ID}`, untitled)).toBe(
      `/listings/${ID}`,
    );
  });

  it("a reserved-word title ('Edit') never yields an /edit-looking slug", () => {
    expect(canonicalListingPath(ID, { id: ID, title: "Edit" })).toBeNull();
  });
});

describe("canonicalRedirectHref", () => {
  it("keeps every key, repeated keys as arrays, and drops undefined ones", () => {
    expect(
      canonicalRedirectHref(CANONICAL, {
        boost: "1",
        utm_source: "x",
        tag: ["a", "b"],
        empty: undefined,
      }),
    ).toEqual({
      pathname: CANONICAL,
      query: { boost: "1", utm_source: "x", tag: ["a", "b"] },
    });
  });

  it("no query (or only undefined keys): the plain path, no stray '?'", () => {
    expect(canonicalRedirectHref(CANONICAL, {})).toBe(CANONICAL);
    expect(canonicalRedirectHref(CANONICAL, { empty: undefined })).toBe(
      CANONICAL,
    );
  });
});
