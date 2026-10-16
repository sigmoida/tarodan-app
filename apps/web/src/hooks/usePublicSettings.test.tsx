// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query/keys";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api", () => ({ publicSettingsApi: { get: h.get } }));

import { useOfferFloor, usePriceLimits } from "./usePublicSettings";

let container: HTMLDivElement;
let root: Root;
let qc: QueryClient;
const limits: Array<ReturnType<typeof usePriceLimits>> = [];
const floors: Array<number | null> = [];

function Limits() {
  limits.push(usePriceLimits());
  return null;
}

function Floor({ price }: { price: number }) {
  floors.push(useOfferFloor(price));
  return null;
}

async function render(node: ReactNode) {
  await act(async () => {
    root.render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  });
  await act(async () => {
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  limits.length = 0;
  floors.length = 0;
  h.get.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
});

describe("usePriceLimits", () => {
  it("genel ayarlardan min/max'i okur; iki tüketici tek istek yapar", async () => {
    h.get.mockResolvedValue({
      data: { max_message_length: 800, min_product_price: 250 },
    });
    await render(
      <>
        <Limits />
        <Floor price={1000} />
      </>,
    );

    expect(h.get).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(queryKeys.publicSettings.all())).toEqual({
      max_message_length: 800,
      min_product_price: 250,
    });
    expect(limits.at(-1)).toEqual({ minPrice: 250, maxPrice: null });
  });

  it("anahtarlar yoksa kural yoktur", async () => {
    h.get.mockResolvedValue({ data: { max_message_length: 800 } });
    await render(<Limits />);

    expect(limits.at(-1)).toEqual({ minPrice: null, maxPrice: null });
  });

  it("istek başarısızsa form engellenmez: sınır yok döner", async () => {
    h.get.mockRejectedValue(new Error("network"));
    await render(<Limits />);

    expect(limits.at(-1)).toEqual({ minPrice: null, maxPrice: null });
  });
});

describe("useOfferFloor", () => {
  it("ilan fiyatı sınırın üstündeyse taban alt sınırdır", async () => {
    h.get.mockResolvedValue({ data: { min_product_price: 250 } });
    await render(<Floor price={1000} />);

    expect(floors.at(-1)).toBe(250);
  });

  it("ilan zaten sınırın altındaysa taban yoktur", async () => {
    h.get.mockResolvedValue({ data: { min_product_price: 250 } });
    await render(<Floor price={200} />);

    expect(floors.at(-1)).toBeNull();
  });
});
