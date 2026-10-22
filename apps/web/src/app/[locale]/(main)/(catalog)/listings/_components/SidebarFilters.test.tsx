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
vi.mock("../_hooks/useSidebarFilters", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../_hooks/useSidebarFilters")>();
  return {
    ...actual,
    useSidebarFilters: () => ({
      t: (key: string) => key,
      // The real default, so a collapsed "options" section would hide the boxes.
      openSections: actual.BASE_SECTIONS,
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
  };
});

import { ListingsProvider, useListings } from "../_context/ListingsContext";
import { buildListApiParams, PAGE_LIMIT } from "../_lib/params";
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

const ALL_FLAGS = "preOrder=true&limited=true&set=true&discountOnly=true";
const FLAG_LABELS = [
  "product.preOrder",
  "product.limitedEdition",
  "product.sets",
  "product.onSale",
];

describe("listings sidebar flag toggles", () => {
  it.each([
    ["product.preOrder", "preOrder"],
    ["product.limitedEdition", "limited"],
    ["product.sets", "set"],
    ["product.onSale", "discountOnly"],
  ])("%s toggles the %s URL and API param", async (label, param) => {
    await mount();
    expect(box(label).checked).toBe(false);

    click(box(label));
    expect(lastUrl()).toBe(`/listings?${param}=true`);
    expect(box(label).checked).toBe(true);
    const sent = h.fetchListings.mock.calls.at(-1)![0];
    expect(buildListApiParams(sent, undefined, 1, PAGE_LIMIT)[param]).toBe(
      true,
    );

    click(box(label));
    expect(lastUrl()).toBe("/listings");
    expect(box(label).checked).toBe(false);
  });

  it("is checked from the URL and counts each active flag once", async () => {
    await mount(ALL_FLAGS);
    for (const label of FLAG_LABELS) expect(box(label).checked).toBe(true);
    const badge = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === "product.filters",
    )!.nextElementSibling;
    expect(badge?.textContent).toBe("4");
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

  it("clear removes all four flags", async () => {
    await mount(ALL_FLAGS);
    click(container.querySelector('[data-testid="clear"]')!);
    for (const label of FLAG_LABELS) expect(box(label).checked).toBe(false);
    expect(lastUrl()).toBe("/listings");
  });
});

const priceBox = (label: "product.minPrice" | "product.maxPrice") =>
  container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    // React tracks the value through the native setter; set it, then fire input.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const refusal = () =>
  [...container.querySelectorAll('[role="alert"]')].find(
    (el) => el.textContent === "validation.amountFormatRefused",
  );
const maxMessage = () =>
  [...container.querySelectorAll('[role="alert"]')].find(
    (el) => el.textContent === "validation.maxValue",
  );
const badgeCount = () =>
  [...container.querySelectorAll("span")].find(
    (s) => s.textContent === "product.filters",
  )!.nextElementSibling?.textContent ?? "0";
const sentParams = () =>
  buildListApiParams(
    h.fetchListings.mock.calls.at(-1)![0],
    undefined,
    1,
    PAGE_LIMIT,
  );
const rangeButton = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  )!;

describe("listings sidebar price range", () => {
  it("is a text field with the decimal keyboard, never type=number", async () => {
    await mount();
    for (const label of ["product.minPrice", "product.maxPrice"] as const) {
      expect(priceBox(label).type).toBe("text");
      expect(priceBox(label).inputMode).toBe("decimal");
    }
  });

  it("writes the canonical bound to the URL and the API", async () => {
    await mount();
    typeInto(priceBox("product.minPrice"), "1250,50");
    expect(lastUrl()).toBe("/listings?minPrice=1250.5");
    expect(priceBox("product.minPrice").value).toBe("1250,50");
    expect(sentParams().minPrice).toBe(1250.5);

    typeInto(priceBox("product.maxPrice"), "2000");
    expect(lastUrl()).toBe("/listings?minPrice=1250.5&maxPrice=2000");
    expect(sentParams().maxPrice).toBe(2000);
    expect(badgeCount()).toBe("1");
    expect(refusal()).toBeUndefined();
  });

  it('refuses "1.000": shows the refusal and searches no min (not 1 TL)', async () => {
    await mount("minPrice=500");
    typeInto(priceBox("product.minPrice"), "1.000");
    expect(refusal()).toBeDefined();
    expect(priceBox("product.minPrice").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(priceBox("product.minPrice").getAttribute("aria-describedby")).toBe(
      refusal()!.id,
    );
    expect(priceBox("product.maxPrice").hasAttribute("aria-invalid")).toBe(
      false,
    );
    // The refused text is not applied: the bound goes, the text stays.
    expect(lastUrl()).toBe("/listings");
    expect(sentParams()).not.toHaveProperty("minPrice");
    expect(priceBox("product.minPrice").value).toBe("1.000");
    expect(badgeCount()).toBe("0");
  });

  it("shows a legacy grouped URL value as refused and ignores its bound", async () => {
    await mount("minPrice=1.000&maxPrice=5000");
    expect(priceBox("product.minPrice").value).toBe("1.000");
    expect(refusal()).toBeDefined();
    const sent = sentParams();
    expect(sent).not.toHaveProperty("minPrice");
    expect(sent.maxPrice).toBe(5000);
  });

  it("zero is no bound and no error", async () => {
    await mount();
    typeInto(priceBox("product.maxPrice"), "0");
    expect(refusal()).toBeUndefined();
    expect(sentParams()).not.toHaveProperty("maxPrice");
    expect(badgeCount()).toBe("0");
  });

  it("keeps a min above the max as typed (no swap, no error)", async () => {
    await mount();
    typeInto(priceBox("product.minPrice"), "500");
    typeInto(priceBox("product.maxPrice"), "100");
    expect(lastUrl()).toBe("/listings?minPrice=500&maxPrice=100");
    expect(sentParams()).toMatchObject({ minPrice: 500, maxPrice: 100 });
    expect(refusal()).toBeUndefined();
  });

  it("a quick range sets both bounds and lights up, also for typed text", async () => {
    await mount();
    click(rangeButton("₺1000+"));
    expect(lastUrl()).toBe("/listings?minPrice=1000");
    expect(rangeButton("₺1000+").className).toContain("bg-primary-500");

    click(rangeButton("₺1000+"));
    expect(lastUrl()).toBe("/listings");

    typeInto(priceBox("product.minPrice"), "100,00");
    typeInto(priceBox("product.maxPrice"), "500");
    expect(rangeButton("₺100-500").className).toContain("bg-primary-500");
  });

  it("no quick range is active while a field is refused", async () => {
    await mount("maxPrice=100");
    expect(rangeButton("₺0-100").className).toContain("bg-primary-500");
    typeInto(priceBox("product.minPrice"), "1.000");
    expect(rangeButton("₺0-100").className).not.toContain("bg-primary-500");
  });

  it("prefills a URL bound with a decimal comma", async () => {
    await mount("minPrice=1250.5");
    expect(priceBox("product.minPrice").value).toBe("1250,50");
  });

  it("shows the max for a bound above it and searches without it", async () => {
    await mount("minPrice=500");
    typeInto(priceBox("product.maxPrice"), "1000");
    expect(lastUrl()).toBe("/listings?minPrice=500&maxPrice=1000");
    typeInto(priceBox("product.maxPrice"), "10000000");
    expect(maxMessage()).toBeDefined();
    expect(refusal()).toBeUndefined();
    expect(priceBox("product.maxPrice").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(priceBox("product.maxPrice").getAttribute("aria-describedby")).toBe(
      maxMessage()!.id,
    );
    expect(priceBox("product.minPrice").hasAttribute("aria-invalid")).toBe(
      false,
    );
    // The search goes on with the other bound; the typed text stays.
    expect(lastUrl()).toBe("/listings?minPrice=500");
    expect(sentParams()).not.toHaveProperty("maxPrice");
    expect(sentParams().minPrice).toBe(500);
    expect(priceBox("product.maxPrice").value).toBe("10000000");
  });

  it("reads a legacy URL bound above the max as no bound and shows why", async () => {
    await mount("maxPrice=10000000");
    expect(priceBox("product.maxPrice").value).toBe("10000000");
    expect(maxMessage()).toBeDefined();
    expect(sentParams()).not.toHaveProperty("maxPrice");
    expect(badgeCount()).toBe("0");
  });

  it("gives each field its own message when one is refused and the other above the max", async () => {
    await mount();
    typeInto(priceBox("product.minPrice"), "1.000");
    typeInto(priceBox("product.maxPrice"), "10000000");
    expect(refusal()).toBeDefined();
    expect(maxMessage()).toBeDefined();
    expect(priceBox("product.minPrice").getAttribute("aria-describedby")).toBe(
      refusal()!.id,
    );
    expect(priceBox("product.maxPrice").getAttribute("aria-describedby")).toBe(
      maxMessage()!.id,
    );
  });

  it("clear empties a refused field and its message", async () => {
    await mount();
    typeInto(priceBox("product.minPrice"), "1.000");
    click(container.querySelector('[data-testid="clear"]')!);
    expect(priceBox("product.minPrice").value).toBe("");
    expect(refusal()).toBeUndefined();
  });
});
