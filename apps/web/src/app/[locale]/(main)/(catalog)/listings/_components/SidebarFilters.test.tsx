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
  fetchListings: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search.value),
}));
vi.mock("@/lib/api", () => ({ categoriesApi: { findBySlug: vi.fn() } }));
vi.mock("../_lib/data", () => ({ fetchListingsClient: h.fetchListings }));
vi.mock("../_hooks/useSidebarFilters", () => ({
  useSidebarFilters: () => ({
    t: (key: string) => key,
    openSections: ["options"],
    setOpenSections: vi.fn(),
    categories: [],
    brandList: [],
    modelsForBrand: [],
    scaleList: [],
    materialList: [],
    colorList: [],
    displayManufacturers: [],
    customAttrGroups: [],
    CONDITIONS: [],
    handleCategoryChange: vi.fn(),
    handleBrandChange: vi.fn(),
    handleCarModelChange: vi.fn(),
    handleScaleChange: vi.fn(),
    handleMaterialChange: vi.fn(),
    toggleColor: vi.fn(),
    handleManufacturerChange: vi.fn(),
    toggleCustomAttribute: vi.fn(),
    handleConditionChange: vi.fn(),
  }),
}));

import { ListingsProvider, useListings } from "../_context/ListingsContext";
import { buildListApiParams } from "../_lib/params";
import { Button } from "@tarodan/ui";
import SidebarFilters from "./SidebarFilters";

function Harness() {
  const {
    filtersForSidebar,
    handleFiltersChange,
    activeFilterCount,
    clearFilters,
    currentPage,
    setCurrentPage,
  } = useListings();
  return (
    <div>
      <SidebarFilters
        filters={filtersForSidebar}
        onFilterChange={handleFiltersChange}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
      />
      <span data-testid="page">{currentPage}</span>
      <Button data-testid="page3" onClick={() => setCurrentPage(3)} />
      <Button data-testid="clear" onClick={clearFilters} />
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

const box = (label: string) =>
  [...container.querySelectorAll("label")]
    .find((l) => l.textContent?.includes(label))!
    .querySelector("input") as HTMLInputElement;
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const lastUrl = () => h.replace.mock.calls.at(-1)?.[0] as string;

async function mount(search = "") {
  h.search.value = search;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <ListingsProvider>
          <Harness />
        </ListingsProvider>
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  h.replace.mockReset().mockImplementation((url: string) => {
    // Follow our own writes like the real router would.
    h.search.value = url.split("?")[1] ?? "";
  });
  h.fetchListings.mockReset().mockResolvedValue({ listings: [], meta: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("listings sidebar flag toggles", () => {
  it.each([
    ["product.preOrder", "preOrder"],
    ["product.limitedEdition", "limited"],
    ["product.sets", "set"],
  ])("%s toggles the %s URL and API param", async (label, param) => {
    await mount();
    expect(box(label).checked).toBe(false);

    click(box(label));
    expect(lastUrl()).toBe(`/listings?${param}=true`);
    expect(box(label).checked).toBe(true);
    const sent = h.fetchListings.mock.calls.at(-1)![0];
    expect(buildListApiParams(sent, undefined, 1, 48)[param]).toBe(true);

    click(box(label));
    expect(lastUrl()).toBe("/listings");
    expect(box(label).checked).toBe(false);
  });

  it("is checked from the URL and counts each active flag once", async () => {
    await mount("preOrder=true&limited=true&set=true");
    expect(box("product.preOrder").checked).toBe(true);
    expect(box("product.limitedEdition").checked).toBe(true);
    expect(box("product.sets").checked).toBe(true);
    expect(container.textContent).toContain("3");
  });

  it("resets to page 1 when a flag changes", async () => {
    await mount();
    click(container.querySelector('[data-testid="page3"]')!);
    expect(container.querySelector('[data-testid="page"]')!.textContent).toBe(
      "3",
    );
    click(box("product.sets"));
    expect(container.querySelector('[data-testid="page"]')!.textContent).toBe(
      "1",
    );
  });

  it("clear removes all three flags", async () => {
    await mount("preOrder=true&limited=true&set=true");
    click(container.querySelector('[data-testid="clear"]')!);
    expect(box("product.preOrder").checked).toBe(false);
    expect(box("product.limitedEdition").checked).toBe(false);
    expect(box("product.sets").checked).toBe(false);
    expect(lastUrl()).toBe("/listings");
  });
});
