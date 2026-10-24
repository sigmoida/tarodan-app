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
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  auth: { isAuthenticated: true },
  filters: {} as unknown,
}));

vi.mock("@/lib/api", () => ({ savedSearchesApi: { create: h.create } }));
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
    expect(api.authModal).toBeNull();
  });

  it("shows the refusal and does not open the save for a refused price", () => {
    // "1.000" is not applied to the search; saving would drop the bound.
    setFilters("search=mustang&minPrice=1.000");
    mount();
    act(() => api.start());
    expect(h.toast.error).toHaveBeenCalledWith(
      "validation.amountFormatRefused",
    );
    expect(api.open).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("shows the bound and does not open the save for a price above the search max", () => {
    // 10,000,000 is not applied to the search (GET /products refuses it).
    setFilters("search=mustang&maxPrice=10000000");
    mount();
    act(() => api.start());
    expect(h.toast.error).toHaveBeenCalledWith("validation.maxValue");
    expect(api.open).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("shows the refusal first when one price is refused and the other too large", () => {
    setFilters("search=mustang&minPrice=1.000&maxPrice=10000000");
    mount();
    act(() => api.start());
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(h.toast.error).toHaveBeenCalledWith(
      "validation.amountFormatRefused",
    );
    expect(h.create).not.toHaveBeenCalled();
  });

  it("gives a guest the shared sign-in prompt instead of the modal", () => {
    h.auth.isAuthenticated = false;
    mount();
    expect(api.authModal).toBeNull();
    act(() => api.start());
    expect(api.open).toBe(false);
    expect(api.authModal).not.toBeNull();
    expect(h.create).not.toHaveBeenCalled();
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
