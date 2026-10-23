// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyBoostRow } from "@tarodan/types";
import { boostRow } from "./_lib/testRows";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * My boosts: tabs, loading / error / empty states, one card per listing for
 * stacked boosts, the refunded line, "Süre Ekle" (hidden while paused) and the
 * Geçmiş pagination. The reminder switch has its own test.
 */

type Section = {
  rows: MyBoostRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  isLoading: boolean;
  isError: boolean;
};
const meta = { total: 0, page: 1, limit: 20, totalPages: 1 };
const h = vi.hoisted(() => ({
  open: vi.fn(),
  boostEnabled: true,
  refetch: vi.fn(),
  download: vi.fn(),
  calls: [] as Array<[string, number]>,
  sections: {} as Record<string, unknown>,
}));
const section = (over: Partial<Section>): Section => ({
  rows: [],
  meta,
  isLoading: false,
  isError: false,
  ...over,
});

vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join("|")})` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt }: { alt: string }) => <span data-img>{alt}</span>,
}));
vi.mock("@/components/ui/ButtonLink", () => ({
  ButtonLink: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/AuthLoadingScreen", () => ({ default: () => null }));
vi.mock("@/components/boost/useBoostLauncher", () => ({
  useBoostLauncher: () => ({ open: h.open, dialog: null }),
}));
vi.mock("@/components/boost/useBoostOffers", () => ({
  useBoostEnabled: () => h.boostEnabled,
}));
vi.mock("../../_hooks/useRequireAuth", () => ({
  useRequireAuth: () => ({ ready: true }),
}));
vi.mock("../_hooks/useInvoiceDownload", () => ({
  useInvoiceDownload: () => ({ downloadingId: null, download: h.download }),
}));
vi.mock("./_components/ReminderToggle", () => ({
  default: ({
    productId,
    checked,
  }: {
    productId: string;
    checked: boolean;
  }) => <span data-reminder={`${productId}:${checked}`} />,
}));
vi.mock("./_hooks/useMyBoosts", () => ({
  useMyBoosts: (state: string, page: number) => {
    h.calls.push([state, page]);
    return { ...(h.sections[state] as Section), refetch: h.refetch };
  },
}));

import MyBoostsPage from "./page";

let container: HTMLDivElement;
let root: Root;

const render = () => act(() => root.render(<MyBoostsPage />));
const text = () => container.textContent ?? "";
const click = (el: Element | null | undefined) =>
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const openTab = (name: string) =>
  act(() => {
    const tab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === name,
    );
    tab?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
  });
const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(label),
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T00:00:00Z"));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.open.mockReset();
  h.boostEnabled = true;
  h.refetch.mockReset();
  h.download.mockReset();
  h.calls = [];
  h.sections = { current: section({}), history: section({}) };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("My boosts page", () => {
  it("shows the two tabs and the support link", async () => {
    await render();
    expect(text()).toContain("profile.boosts.sections.current");
    expect(text()).toContain("profile.boosts.sections.history");
    expect(container.querySelector('a[href="/support"]')).not.toBeNull();
  });

  it("shows skeletons while loading", async () => {
    h.sections.current = section({ isLoading: true });
    await render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("shows the load error with a retry that refetches", async () => {
    h.sections.current = section({ isError: true });
    await render();
    expect(text()).toContain("profile.boosts.loadFailed");
    await click(button("common.tryAgain"));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state linking to My listings", async () => {
    await render();
    expect(text()).toContain("profile.boosts.empty.title");
    expect(
      container.querySelector('a[href="/profile/listings"]')?.textContent,
    ).toBe("profile.boosts.empty.action");
  });

  it("groups stacked boosts of one listing into one card with the remaining time once", async () => {
    h.sections.current = section({
      rows: [
        boostRow({
          id: "b2",
          startsAt: "2026-10-27T00:00:00Z",
          createdAt: "2026-10-21T00:00:00Z",
          durationDays: 3,
          price: 40,
        }),
        boostRow({ id: "b1", price: 100 }),
        boostRow({
          id: "o1",
          productId: "p2",
          product: {
            id: "p2",
            title: "Mustang",
            status: "active",
            image: null,
            boostedUntil: "2026-10-23T05:00:00Z",
            homeShowcaseUntil: null,
          },
        }),
      ],
    });
    await render();
    // Camaro: 8 d 0 h (until the 30th), shown once for its two purchases.
    expect(text().match(/profile\.boosts\.remaining\(8\|0\)/g)).toHaveLength(1);
    expect(text()).toContain("profile.boosts.remaining(1|5)");
    expect(text().match(/Camaro/g)).toHaveLength(2); // title link + image alt
    expect(text()).toContain("profile.boosts.extended(3)");
    expect(text()).toContain("Mustang");
  });

  it("opens the boost dialog from Süre Ekle with the listing's end", async () => {
    h.sections.current = section({ rows: [boostRow()] });
    await render();
    await click(button("product.extendBoost"));
    expect(h.open).toHaveBeenCalledWith({
      id: "p1",
      title: "Camaro",
      boostedUntil: "2026-10-30T00:00:00Z",
    });
  });

  it("hides Süre Ekle and the remaining time while paused, and shows the hint", async () => {
    h.sections.current = section({
      rows: [boostRow({ status: "paused" })],
    });
    await render();
    expect(button("product.extendBoost")).toBeUndefined();
    expect(text()).not.toContain("profile.boosts.remaining");
    expect(text()).toContain("profile.boosts.pausedHint");
    expect(text()).toContain("profile.boosts.status.paused");
  });

  it("hides Süre Ekle while boost sales are off, as the card action does", async () => {
    h.boostEnabled = false;
    h.sections.current = section({ rows: [boostRow()] });
    await render();
    expect(button("product.extendBoost")).toBeUndefined();
    expect(text()).toContain("profile.boosts.remaining");
  });

  it("passes the listing's reminder state to the switch", async () => {
    h.sections.current = section({
      rows: [boostRow({ id: "b1" }), boostRow({ id: "b2", autoRenew: true })],
    });
    await render();
    expect(container.querySelector('[data-reminder="p1:true"]')).not.toBeNull();
  });

  it("marks the best performing listing and shows the gain or the pending note", async () => {
    h.sections.current = section({
      rows: [
        boostRow({
          isBest: true,
          metrics: {
            before: { views: 1, likes: 1, clicks: 1 },
            current: { views: 11, likes: 2, clicks: 4 },
            gain: { views: 10, likes: 1, clicks: 3 },
            performanceScore: 5,
          },
        }),
        boostRow({
          id: "o1",
          productId: "p2",
          product: { ...boostRow().product, id: "p2", title: "Mustang" },
        }),
      ],
    });
    await render();
    expect(text()).toContain("profile.boosts.best");
    expect(text()).toContain("profile.boosts.performance.title");
    expect(text()).toContain("profile.boosts.performance.pending");
  });

  it("shows a counter that went down as no gain, not a negative one", async () => {
    h.sections.current = section({
      rows: [
        boostRow({
          metrics: {
            before: { views: 1, likes: 10, clicks: 1 },
            current: { views: 4, likes: 8, clicks: 1 },
            gain: { views: 3, likes: -2, clicks: 0 },
            performanceScore: 3,
          },
        }),
      ],
    });
    await render();
    expect(text()).not.toContain("-2");
  });

  describe("Geçmiş", () => {
    const refunded = boostRow({
      id: "h1",
      status: "cancelled",
      refundedAmount: 75,
      price: 100,
    });

    it("renders statuses, the refunded amount, grants and the invoice link", async () => {
      h.sections.history = section({
        rows: [
          refunded,
          boostRow({ id: "h2", status: "expired", orderId: "o2" }),
          boostRow({
            id: "h3",
            status: "expired",
            source: "admin_grant",
            price: 0,
            orderId: null,
          }),
        ],
      });
      await render();
      await openTab("profile.boosts.sections.history");
      expect(text()).toContain("profile.boosts.status.refunded");
      expect(text()).toContain("profile.boosts.refundedAmount(75,00 TL)");
      expect(text()).toContain("profile.boosts.status.expired");
      expect(text()).toContain("profile.boosts.source.adminGrant");
      const invoices = Array.from(container.querySelectorAll("button")).filter(
        (el) => el.textContent === "profile.boosts.invoice",
      );
      expect(invoices).toHaveLength(2); // refunded + expired; not the grant
      await click(invoices[1]);
      expect(h.download).toHaveBeenCalledWith("o2");
      expect(button("product.extendBoost")).toBeUndefined();
    });

    it("strikes the price only when all of it was refunded", async () => {
      h.sections.history = section({
        rows: [
          refunded,
          boostRow({
            id: "h4",
            productId: "p4",
            status: "cancelled",
            refundedAmount: 200,
            price: 200,
          }),
        ],
      });
      await render();
      await openTab("profile.boosts.sections.history");
      const struck = Array.from(container.querySelectorAll(".line-through"));
      expect(struck.map((el) => el.textContent)).toEqual(["200,00 TL"]);
    });

    it("pages with Pagination and asks the API for the chosen page", async () => {
      h.sections.history = section({
        rows: [refunded],
        meta: { total: 45, page: 1, limit: 20, totalPages: 3 },
      });
      await render();
      await openTab("profile.boosts.sections.history");
      expect(h.calls).toContainEqual(["history", 1]);
      await click(button("2"));
      expect(h.calls).toContainEqual(["history", 2]);
    });
  });
});
