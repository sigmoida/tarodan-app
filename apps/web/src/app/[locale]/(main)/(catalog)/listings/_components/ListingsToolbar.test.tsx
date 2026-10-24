// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  search: { value: "" },
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search.value),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "tr",
}));
vi.mock("@/lib/api", () => ({ categoriesApi: { findBySlug: vi.fn() } }));
vi.mock("../_lib/data", () => ({
  fetchListingsClient: vi.fn().mockResolvedValue({ listings: [], meta: {} }),
}));
// The save-search controls sit in the same module but not in the chips row;
// their auth chain pulls `server-only`.
vi.mock("../_hooks/useSaveSearch", () => ({ useSaveSearch: vi.fn() }));
vi.mock("../_modals/SaveSearchModal", () => ({ default: () => null }));
vi.mock("@/hooks/useListingFiltersQuery", () => ({
  useListingFiltersQuery: () => ({ data: undefined }),
}));

import { ListingsProvider } from "../_context/ListingsContext";
import { ActiveFilterChips } from "./ListingsToolbar";

let container: HTMLDivElement;
let root: Root;

async function mount(search: string) {
  h.search.value = search;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <ListingsProvider>
          <ActiveFilterChips />
        </ListingsProvider>
      </QueryClientProvider>,
    );
  });
}

const chipTexts = () =>
  [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");

beforeEach(() => {
  h.replace.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("listings price chip", () => {
  it("labels the applied bounds as TL amounts", async () => {
    await mount("minPrice=1000&maxPrice=1250.5");
    expect(chipTexts()).toContain("1.000,00 TL - 1.250,50 TL");
  });

  it("an open top reads ∞ and an open bottom 0", async () => {
    await mount("minPrice=1000");
    expect(chipTexts()).toContain("1.000,00 TL - ∞");
    await mount("maxPrice=500");
    expect(chipTexts()).toContain("0,00 TL - 500,00 TL");
  });

  it('never shows a refused "1.000" as 1 TL', async () => {
    await mount("minPrice=1.000&maxPrice=500");
    expect(chipTexts()).toContain("0,00 TL - 500,00 TL");
    expect(chipTexts().join(" ")).not.toContain("1,00 TL");
  });

  it("has no price chip when no bound is set", async () => {
    await mount("minPrice=1.000&tradeOnly=true");
    expect(chipTexts().some((text) => text.includes("TL"))).toBe(false);
  });
});
