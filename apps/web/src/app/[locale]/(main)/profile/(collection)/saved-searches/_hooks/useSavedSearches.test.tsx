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
  list: vi.fn(),
  remove: vi.fn(),
  getLimits: vi.fn(),
  getTiers: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  savedSearchesApi: { list: h.list, remove: h.remove },
  membershipApi: { getLimits: h.getLimits, getTiers: h.getTiers },
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/components/ConfirmProvider", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from "react-hot-toast";
import { makeQueryClient } from "@/lib/query/client";
import { useSavedSearches } from "./useSavedSearches";

const search = {
  id: "s1",
  name: "Mustangs",
  query: { search: "mustang", tradeOnly: true as const },
  labels: {},
  createdAt: "2026-10-21T10:00:00.000Z",
};

const tiers = [
  { type: "free", maxSavedSearches: 5 },
  { type: "basic", maxSavedSearches: 10 },
  { type: "premium", maxSavedSearches: 20 },
  { type: "business", maxSavedSearches: 50 },
];

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let api: ReturnType<typeof useSavedSearches>;

function Harness({ enabled }: { enabled: boolean }) {
  api = useSavedSearches(enabled);
  return null;
}
const mount = async (enabled = true) => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness enabled={enabled} />
      </QueryClientProvider>,
    ),
  );
  // Let the list and limit queries settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

beforeEach(() => {
  h.list.mockResolvedValue({
    data: { data: [search], meta: { total: 1, page: 1, limit: 100 } },
  });
  h.getLimits.mockResolvedValue({ data: { maxSavedSearches: 10 } });
  h.getTiers.mockResolvedValue({ data: tiers });
  h.remove.mockResolvedValue({});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = makeQueryClient();
  localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  vi.clearAllMocks();
});

describe("useSavedSearches", () => {
  it("reads the server list and the server limit", async () => {
    await mount();
    expect(api.savedSearches).toEqual([search]);
    expect(api.total).toBe(1);
    expect(api.limit).toBe(10);
  });

  it("keeps a limit of 0 (no fallback to 5)", async () => {
    h.getLimits.mockResolvedValue({ data: { maxSavedSearches: 0 } });
    await mount();
    expect(api.limit).toBe(0);
  });

  it("does not fetch before the session is ready", async () => {
    await mount(false);
    expect(h.list).not.toHaveBeenCalled();
    expect(h.getLimits).not.toHaveBeenCalled();
  });

  it("reads every page when a tier allows more than one page", async () => {
    const page2 = { ...search, id: "s2" };
    h.list.mockImplementation(async (page: number) => ({
      data:
        page === 1
          ? { data: [search], meta: { total: 2, page: 1, totalPages: 2 } }
          : { data: [page2], meta: { total: 2, page: 2, totalPages: 2 } },
    }));
    await mount();
    await vi.waitFor(() =>
      expect(api.savedSearches.map((s) => s.id)).toEqual(["s1", "s2"]),
    );
    expect(h.list.mock.calls.map(([page]) => page).sort()).toEqual([1, 2]);
    expect(api.total).toBe(2);
  });

  it("keeps a search once when it shifts onto the next page", async () => {
    h.list.mockImplementation(async (page: number) => ({
      data: {
        data: page === 1 ? [search] : [search, { ...search, id: "s2" }],
        meta: { total: 2, page, totalPages: 2 },
      },
    }));
    await mount();
    await vi.waitFor(() =>
      expect(api.savedSearches.map((s) => s.id)).toEqual(["s1", "s2"]),
    );
  });

  /** A user at `limit` searches (`total === limit`), so the alert shows. */
  const atLimit = (limit: number) => {
    h.getLimits.mockResolvedValue({ data: { maxSavedSearches: limit } });
    h.list.mockResolvedValue({
      data: { data: [search], meta: { total: limit, page: 1, totalPages: 1 } },
    });
  };

  it("offers the Premium upgrade at a limit below Premium's", async () => {
    atLimit(10);
    await mount();
    await vi.waitFor(() => expect(api.canUpgrade).toBe(true));
    expect(api.atLimit).toBe(true);
  });

  it.each([20, 50])(
    "offers no upgrade at a limit of %i (Premium, Business)",
    async (limit) => {
      atLimit(limit);
      await mount();
      await vi.waitFor(() => expect(h.getTiers).toHaveBeenCalled());
      await mount();
      expect(api.atLimit).toBe(true);
      expect(api.canUpgrade).toBe(false);
    },
  );

  it("offers no upgrade while every tier has the same limit", async () => {
    atLimit(5);
    h.getTiers.mockResolvedValue({
      data: tiers.map((tier) => ({ ...tier, maxSavedSearches: 5 })),
    });
    await mount();
    await vi.waitFor(() => expect(h.getTiers).toHaveBeenCalled());
    await mount();
    expect(api.canUpgrade).toBe(false);
  });

  it("does not read the tier rows below the limit", async () => {
    await mount();
    expect(api.atLimit).toBe(false);
    expect(api.canUpgrade).toBe(false);
    expect(h.getTiers).not.toHaveBeenCalled();
  });

  it("deletes after a confirm and refetches the list", async () => {
    h.confirm.mockResolvedValue(true);
    await mount();
    h.list.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });
    await act(async () => {
      await api.remove(search);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(h.remove).toHaveBeenCalledWith("s1");
    expect(api.savedSearches).toEqual([]);
  });

  it("treats a 404 delete as deleted: success toast, list refetched", async () => {
    h.confirm.mockResolvedValue(true);
    h.remove.mockRejectedValue({
      response: {
        status: 404,
        data: { i18nKey: "server.savedSearch.notFound" },
      },
    });
    await mount();
    h.list.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });
    await act(async () => {
      await api.remove(search);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(toast.success).toHaveBeenCalledWith("savedSearch.deleted");
    expect(toast.error).not.toHaveBeenCalled();
    expect(api.savedSearches).toEqual([]);
  });

  it("still fails a 404 that is not the saved-search not-found key", async () => {
    h.confirm.mockResolvedValue(true);
    h.remove.mockRejectedValue({ response: { status: 404, data: {} } });
    await mount();
    await act(async () => {
      await api.remove(search);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("still fails a delete on other errors", async () => {
    h.confirm.mockResolvedValue(true);
    h.remove.mockRejectedValue({ response: { status: 500 } });
    await mount();
    await act(async () => {
      await api.remove(search);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports isSuccess only once the list has loaded", async () => {
    await mount();
    expect(api.isSuccess).toBe(true);
    h.list.mockRejectedValue(new Error("boom"));
    client.clear();
    await mount(false);
    expect(api.isSuccess).toBe(false);
  });

  it("does not delete when the confirm is declined", async () => {
    h.confirm.mockResolvedValue(false);
    await mount();
    await act(async () => {
      await api.remove(search);
    });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("runs a search through the shared route params", async () => {
    await mount();
    act(() => api.runSearch(search));
    expect(h.push).toHaveBeenCalledWith(
      "/listings?search=mustang&tradeOnly=true",
    );
  });
});
