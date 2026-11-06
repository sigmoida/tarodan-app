/** @format */

import { QueryClient, hydrate } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query/keys";

const h = vi.hoisted(() => ({ queryClient: null as unknown }));

vi.mock("@/lib/query/server", () => ({
  getServerQueryClient: () => h.queryClient,
}));
vi.mock("@/lib/api/origin", () => ({
  getServerApiOrigin: () => "http://api.test",
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
vi.mock("./CollectionDetailClient", () => ({ default: () => null }));

import CollectionPage from "./page";

const ID = "col-1";
const KEY = queryKeys.collection.detail(ID);
const REMOVED = { id: ID, items: [{ id: "removed" }] };
const FRESH = { id: ID, items: [] };

const renderSeed = async (headers: Record<string, string>) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ collection: REMOVED }), { headers }),
    ),
  );
  const element = (await CollectionPage({
    params: Promise.resolve({ id: ID, locale: "tr" }),
  })) as ReactElement<{ state: Parameters<typeof hydrate>[1] }>;
  return element.props.state;
};

describe("CollectionPage seed", () => {
  beforeEach(() => {
    h.queryClient = new QueryClient();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not overwrite a fresher client cache with an older cached body", async () => {
    const bodyTime = Date.now() - 30_000;
    const state = await renderSeed({
      date: new Date(bodyTime).toUTCString(),
    });

    // The owner removed the item and refetched after the body was produced.
    const client = new QueryClient();
    client.setQueryData(KEY, FRESH, { updatedAt: bodyTime + 10_000 });
    hydrate(client, state);

    expect(client.getQueryData(KEY)).toEqual(FRESH);
  });

  it("marks a body past the stale time as stale, so the client refetches", async () => {
    const state = await renderSeed({
      date: new Date(Date.now() - 120_000).toUTCString(),
    });

    const client = new QueryClient();
    hydrate(client, state);

    expect(client.getQueryData(KEY)).toEqual(REMOVED);
    expect(
      client.getQueryCache().find({ queryKey: KEY })?.isStaleByTime(60_000),
    ).toBe(true);
  });

  it("falls back to the render time without a date header", async () => {
    const before = Date.now();
    const state = await renderSeed({});
    expect(state.queries?.[0].state.dataUpdatedAt).toBeGreaterThanOrEqual(
      before,
    );
  });
});
