/** @format */

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("./HomeSection", () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) => (
    <section data-title={title}>{children}</section>
  ),
}));
vi.mock("./ProductRail", () => ({
  default: ({
    items,
    emptyState,
  }: {
    items: Product[];
    emptyState?: ReactNode;
  }) => (
    <i data-server-cards={items.map((p) => p.id).join(",")}>{emptyState}</i>
  ),
}));
vi.mock("./HomeRailClient", () => ({
  HomeRailGate: ({
    rail,
    showWhenEmpty,
    children,
  }: {
    rail: string;
    showWhenEmpty?: boolean;
    children: ReactNode;
  }) => (
    <div data-gate={rail} data-show-when-empty={String(showWhenEmpty)}>
      {children}
    </div>
  ),
  HomeRailCards: ({ rail }: { rail: string }) => <i data-client-cards={rail} />,
}));

import HomeRailSection from "./HomeRailSection";

const props = {
  rail: "trade",
  title: "nav.tradeShowcase",
  viewAllHref: "/takas",
} as const;
const items = [{ id: "p1", title: "A", price: 1 }] as Product[];
const render = async (node: Parameters<typeof HomeRailSection>[0]) => {
  const el = await HomeRailSection(node);
  return el === null ? null : renderToStaticMarkup(el);
};

describe("HomeRailSection", () => {
  it("renders server-seeded products on the server, without a gate", async () => {
    const html = await render({ ...props, items });
    expect(html).toContain('data-title="nav.tradeShowcase"');
    expect(html).toContain('data-server-cards="p1"');
    expect(html).not.toContain("data-gate");
  });

  it("hides a rail whose fetch answered empty", async () => {
    expect(await render({ ...props, items: [] })).toBeNull();
  });

  it("shows the empty state of a rail that has one", async () => {
    const html = await render({
      ...props,
      items: [],
      emptyState: <b data-empty />,
    });
    expect(html).toContain("data-empty");
  });

  it("loads a failed rail client-side behind the gate", async () => {
    const html = await render({ ...props, items: null });
    expect(html).toContain('data-gate="trade"');
    expect(html).toContain('data-show-when-empty="false"');
    expect(html).toContain('data-client-cards="trade"');
    expect(html).not.toContain("data-server-cards");
  });

  it("lets the gate show the empty state of a client-loaded rail", async () => {
    const html = await render({
      ...props,
      items: null,
      emptyState: <b data-empty />,
    });
    expect(html).toContain('data-show-when-empty="true"');
  });

  it("uses a custom body for both seeds", async () => {
    const body = <i data-body />;
    expect(await render({ ...props, items, body })).toContain("data-body");
    const failed = await render({ ...props, items: null, body });
    expect(failed).toContain("data-body");
    expect(failed).toContain('data-gate="trade"');
  });
});
