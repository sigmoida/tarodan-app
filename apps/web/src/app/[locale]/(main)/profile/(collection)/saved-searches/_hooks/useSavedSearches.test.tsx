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
  confirm: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  savedSearchesApi: { list: h.list, remove: h.remove },
  membershipApi: { getLimits: h.getLimits },
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

import { makeQueryClient } from "@/lib/query/client";
import { useSavedSearches } from "./useSavedSearches";

const search = {
  id: "s1",
  name: "Mustangs",
  query: { search: "mustang", tradeOnly: true as const },
  labels: {},
  createdAt: "2026-10-21T10:00:00.000Z",
};

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

  it("discards the old local list once, without importing it", async () => {
    localStorage.setItem(
      "diecast_saved_searches",
      JSON.stringify([{ id: "old", query: "porsche" }]),
    );
    await mount();
    expect(localStorage.getItem("diecast_saved_searches")).toBeNull();
    expect(api.savedSearches.map((s) => s.id)).toEqual(["s1"]);
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
