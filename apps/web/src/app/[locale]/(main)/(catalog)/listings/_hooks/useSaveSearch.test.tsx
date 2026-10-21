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
  create: vi.fn(),
  push: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  auth: { isAuthenticated: true },
  filters: {} as unknown,
}));

vi.mock("@/lib/api", () => ({ savedSearchesApi: { create: h.create } }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: typeof h.auth) => unknown) => sel(h.auth),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("../_context/ListingsContext", () => ({
  useListings: () => ({ filtersForSidebar: h.filters }),
}));

import { makeQueryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { parseListingsFilters } from "../_lib/params";
import { useSaveSearch } from "./useSaveSearch";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let api: ReturnType<typeof useSaveSearch>;

function Harness() {
  api = useSaveSearch();
  return null;
}

const setFilters = (query: string) => {
  h.filters = parseListingsFilters(new URLSearchParams(query));
};
const mount = () =>
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
const httpError = (status: number, data: Record<string, unknown>) => ({
  response: { status, data },
});

beforeEach(() => {
  h.auth.isAuthenticated = true;
  setFilters("search=mustang&tradeOnly=true");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = makeQueryClient();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  vi.clearAllMocks();
});

describe("useSaveSearch", () => {
  it("exposes the canonical draft and its default name", () => {
    mount();
    expect(api.draft.query).toEqual({ search: "mustang", tradeOnly: true });
    expect(api.draft.isEmpty).toBe(false);
    expect(api.draft.defaultName).toBe("mustang");
  });

  it("does nothing for an empty search", () => {
    setFilters("sortBy=price_asc");
    mount();
    expect(api.draft.isEmpty).toBe(true);
    act(() => api.start());
    expect(api.open).toBe(false);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("sends a guest to sign in with a return URL", () => {
    h.auth.isAuthenticated = false;
    window.history.replaceState(null, "", "/listings?search=mustang");
    mount();
    act(() => api.start());
    expect(api.open).toBe(false);
    expect(h.push).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent("/listings?search=mustang")}`,
    );
  });

  it("saves, closes, and invalidates the saved-search list", async () => {
    h.create.mockResolvedValue({ data: { id: "s1" } });
    client.setQueryData([queryKeys.savedSearches.resource, "list"], []);
    mount();
    act(() => api.start());
    expect(api.open).toBe(true);
    await act(async () => api.save("My search"));
    expect(h.create).toHaveBeenCalledWith({
      name: "My search",
      query: { search: "mustang", tradeOnly: true },
      labels: {},
    });
    expect(api.open).toBe(false);
    expect(h.toast.success).toHaveBeenCalledWith("savedSearch.saved");
    expect(
      client.getQueryState([queryKeys.savedSearches.resource, "list"])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("keeps the modal open and reports a duplicate (409)", async () => {
    h.create.mockRejectedValue(
      httpError(409, { errorCode: "SAVED_SEARCH_DUPLICATE" }),
    );
    mount();
    act(() => api.start());
    await act(async () => api.save("x"));
    expect(api.open).toBe(true);
    expect(api.refusal).toEqual({ kind: "duplicate" });
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("keeps the modal open and reports the server limit (403)", async () => {
    h.create.mockRejectedValue(
      httpError(403, { errorCode: "SAVED_SEARCH_LIMIT", limit: 5 }),
    );
    mount();
    act(() => api.start());
    await act(async () => api.save("x"));
    expect(api.open).toBe(true);
    expect(api.refusal).toEqual({ kind: "limit", limit: 5 });
  });

  it("does not read another 403 (a ban) as the limit", async () => {
    h.create.mockRejectedValue(
      httpError(403, { errorCode: "USER_BANNED", message: "banned" }),
    );
    mount();
    act(() => api.start());
    await act(async () => api.save("x"));
    expect(api.refusal).toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith("banned");
  });
});
