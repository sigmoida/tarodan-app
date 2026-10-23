/** @format */

import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

// Only the header band is pinned here; the section logic has its own test.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("./HomeRailSection", () => ({ default: () => null }));

import OnSaleRail from "./OnSaleRail";

const items = [{ id: "p1", title: "A", price: 1 }] as Product[];

describe("OnSaleRail", () => {
  it("has no fixed 'deals' badge in the header", async () => {
    const el = await OnSaleRail({ items });
    expect(el.props).toMatchObject({
      rail: "discounted",
      title: "product.onSale",
      items,
    });
    expect(el.props).not.toHaveProperty("badge");
  });

  it("has no empty state, so an empty answer hides the rail", async () => {
    const el = await OnSaleRail({ items: [] });
    expect(el.props.emptyState).toBeUndefined();
  });
});
