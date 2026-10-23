// @vitest-environment jsdom

/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ getAll: vi.fn(), getPopular: vi.fn() }));

vi.mock("@/lib/api", () => ({
  listingsApi: { getAll: h.getAll, getPopular: h.getPopular },
}));
vi.mock("./ProductRail", () => ({
  default: ({ items }: { items: Product[] }) => (
    <i data-cards={items.map((p) => p.id).join(",")} />
  ),
}));

import { HomeRailCards, HomeRailGate } from "./HomeRailClient";

const product = (id: string, over: Partial<Product> = {}) =>
  ({ id, title: id, price: 10, ...over }) as Product;
const labels = { badgeLabels: {} as never, outOfStockLabel: "out" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.getAll.mockReset();
  h.getPopular.mockReset();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

async function render(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
  });
  // Let the query settle and the gate re-render.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const section = (
  rail: "trade" | "popular" | "discounted",
  showWhenEmpty?: boolean,
) => (
  <HomeRailGate rail={rail} showWhenEmpty={showWhenEmpty}>
    <section data-section>
      <HomeRailCards rail={rail} {...labels} />
    </section>
  </HomeRailGate>
);

describe("HomeRailGate + HomeRailCards", () => {
  it("renders nothing while the rail loads", async () => {
    h.getAll.mockReturnValue(new Promise(() => {}));
    await render(section("trade"));
    expect(container.innerHTML).toBe("");
  });

  it("shows the section once the browser fetch returns products", async () => {
    h.getAll.mockResolvedValue({ data: { data: [product("a")] } });
    await render(section("trade"));
    expect(container.querySelector("[data-section]")).not.toBeNull();
    expect(
      container.querySelector("[data-cards]")?.getAttribute("data-cards"),
    ).toBe("a");
    expect(h.getAll).toHaveBeenCalledTimes(1);
    expect(h.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ tradeOnly: true, status: "active" }),
    );
  });

  it("stays hidden when the browser fetch fails too", async () => {
    h.getAll.mockRejectedValue(new Error("boom"));
    await render(section("trade"));
    expect(container.innerHTML).toBe("");
  });

  it("stays hidden on an empty answer unless the rail has an empty state", async () => {
    h.getPopular.mockResolvedValue({ data: [] });
    await render(section("popular"));
    expect(container.innerHTML).toBe("");

    await render(section("popular", true));
    expect(container.querySelector("[data-cards]")).not.toBeNull();
  });

  it("loads popular from its own endpoint", async () => {
    h.getPopular.mockResolvedValue({ data: [product("p")] });
    await render(section("popular"));
    expect(h.getPopular).toHaveBeenCalledWith({ limit: 20, page: 1 });
    expect(h.getAll).not.toHaveBeenCalled();
  });

  it("keeps real discounts only on the on-sale rail", async () => {
    const onSale = product("sale", { price: 80, oldPrice: 100 });
    h.getAll.mockResolvedValue({ data: [product("plain"), onSale] });
    await render(section("discounted"));
    expect(
      container.querySelector("[data-cards]")?.getAttribute("data-cards"),
    ).toBe("sale");
  });
});
