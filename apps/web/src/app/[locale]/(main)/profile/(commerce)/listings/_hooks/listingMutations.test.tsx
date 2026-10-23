// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  listingsApi: {
    delete: vi.fn(),
    deactivate: vi.fn(),
    renew: vi.fn(),
    renewMany: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({ listingsApi: h.listingsApi, userApi: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ refreshUserData: vi.fn() }) },
}));
vi.mock("@/lib/logger", () => ({ logger: { captureException: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { makeQueryClient } from "@/lib/query/client";
import { queryKeys, webKeys } from "@/lib/query/keys";
import { useDeactivateListing, useDeleteListing } from "./useMyListings";
import { useRenewListing, useRenewListings } from "./useRenewListings";

/** The trade picker's real key: per user and per target listing. */
const PICKER_KEY = webKeys.list(queryKeys.tradeEligible.resource, {
  userId: "u1",
  listingId: "t1",
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

/** Mount the mutation hook and run it once with `vars`. */
async function runMutation<V>(
  useHook: () => { mutateAsync: (v: V) => Promise<unknown> },
  vars: V,
) {
  let mutation: ReturnType<typeof useHook> | undefined;
  function Harness() {
    mutation = useHook();
    return null;
  }
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await mutation!.mutateAsync(vars);
  });
}

beforeEach(() => {
  h.listingsApi.delete.mockResolvedValue({});
  h.listingsApi.deactivate.mockResolvedValue({});
  h.listingsApi.renew.mockResolvedValue({ data: { status: "active" } });
  h.listingsApi.renewMany.mockResolvedValue({
    data: { results: [], renewed: 1, submitted: 0, failed: 0 },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = makeQueryClient();
  client.setQueryData(PICKER_KEY, []);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

const removal = { removalReason: "sold_elsewhere" };

describe("my listings mutations mark the trade picker stale", () => {
  it.each([
    ["delete", () => runMutation(useDeleteListing, { id: "p1", removal })],
    [
      "deactivate",
      () => runMutation(useDeactivateListing, { id: "p1", removal }),
    ],
    ["renew one", () => runMutation(useRenewListing, "p1")],
    [
      "renew several",
      () => runMutation(useRenewListings, [{ id: "p1", title: "P1" }]),
    ],
  ])("%s", async (_name, run) => {
    expect(client.getQueryState(PICKER_KEY)?.isInvalidated).toBe(false);
    await run();
    expect(client.getQueryState(PICKER_KEY)?.isInvalidated).toBe(true);
  });
});
