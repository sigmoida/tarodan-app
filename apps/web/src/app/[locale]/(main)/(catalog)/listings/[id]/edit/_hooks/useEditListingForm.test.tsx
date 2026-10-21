// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  priceLimitMessages,
  type ListingEditPayload,
} from "@tarodan/listing-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  listingsApi: { update: vi.fn() },
  userApi: { getMyProductById: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  limits: { minPrice: null as number | null, maxPrice: null as number | null },
}));

vi.mock("@/lib/api", () => ({
  listingsApi: h.listingsApi,
  userApi: h.userApi,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/query/invalidateListing", () => ({
  invalidateListingQueries: vi.fn(),
}));
vi.mock("@/hooks/usePublicSettings", () => ({
  usePriceLimits: () => ({ ...h.limits }),
}));
vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useTranslations: () => (k: string) => k,
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));

import { useEditListingForm } from "./useEditListingForm";

const MESSAGES = priceLimitMessages("tr");
const REFUSED = MESSAGES.amountFormatRefused;

/** The listing on record: 1250,50 TL, no discount. */
const EDIT = {
  title: "Porsche 911",
  description: "A long enough description of the model car.",
  price: 1250.5,
  oldPrice: null,
  salePrice: null,
  saleStartDate: null,
  saleEndDate: null,
  categoryId: "category-1",
  brandId: "",
  carModelId: "",
  manufacturerId: "",
  condition: "very_good",
  status: "active",
  quantity: 1,
  shippingPackageTier: "small",
  isTradeEnabled: false,
  isSet: false,
  isBoxed: true,
  images: [],
} as unknown as ListingEditPayload;

let container: HTMLDivElement;
let root: Root;
let hook: ReturnType<typeof useEditListingForm>;

function Harness() {
  hook = useEditListingForm({
    id: "p1",
    authLoading: false,
    isAuthenticated: true,
  });
  return null;
}

async function waitFor(assertion: () => void) {
  let last: unknown;
  for (let i = 0; i < 50; i++) {
    try {
      assertion();
      return;
    } catch (e) {
      last = e;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
  }
  throw last;
}

beforeEach(async () => {
  vi.clearAllMocks();
  h.limits.minPrice = null;
  h.userApi.getMyProductById.mockResolvedValue({
    data: { product: { edit: EDIT } },
  });
  h.listingsApi.update.mockResolvedValue({ data: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  await waitFor(() => expect(hook.form.getValues("price")).toBe("1250,50"));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function setSale(sale: { salePrice?: string; originalPrice?: string }) {
  await act(async () => {
    hook.setSaleData((current) => ({ ...current, ...sale }));
  });
}

async function submit() {
  await act(async () => {
    hook.onSubmit(hook.form.getValues());
  });
}

describe("useEditListingForm price and discount", () => {
  it("saves the prefilled comma price exactly, with no discount", async () => {
    await submit();
    await waitFor(() => expect(h.listingsApi.update).toHaveBeenCalledTimes(1));
    expect(h.listingsApi.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        price: 1250.5,
        originalPrice: null,
        salePrice: null,
      }),
    );
  });

  it.each([
    { salePrice: "1.000" },
    { salePrice: "999,90", originalPrice: "1.250,50" },
  ])(
    "blocks the save on refused discount text %j instead of clearing the sale",
    async (sale) => {
      await setSale(sale);
      expect(hook.salePriceError).toBe(REFUSED);
      await submit();
      expect(h.listingsApi.update).not.toHaveBeenCalled();
      expect(h.toast.error).toHaveBeenCalledWith(REFUSED);
      expect(hook.showDiscountSection).toBe(true);
    },
  );

  it("holds a sale price below the floor against the comma price", async () => {
    // Read with Number(), "1250,50" is NaN and no discount would be checked.
    h.limits.minPrice = 250;
    await setSale({ salePrice: "200" });
    expect(hook.salePriceError).toBe(MESSAGES.salePriceBelowMinimum(250));
    await submit();
    expect(h.listingsApi.update).not.toHaveBeenCalled();
  });

  it("saves a comma sale price exactly against the comma price", async () => {
    await setSale({ salePrice: "999,90" });
    expect(hook.salePriceError).toBeNull();
    await submit();
    await waitFor(() => expect(h.listingsApi.update).toHaveBeenCalledTimes(1));
    expect(h.listingsApi.update).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        price: 1250.5,
        originalPrice: 1250.5,
        salePrice: 999.9,
      }),
    );
  });
});
