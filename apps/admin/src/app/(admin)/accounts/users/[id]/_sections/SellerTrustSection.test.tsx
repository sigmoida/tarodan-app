// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminSellerTrustView,
  SellerTrustComponentsV1,
} from "@tarodan/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));

import { SellerTrustSection } from "./SellerTrustSection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const components: SellerTrustComponentsV1 = {
  version: 1,
  rating: { raters: 12, smoothed: 4.5, subScore: 0.875 },
  reliability: { eligibleOrders: 15, failures: 1, subScore: 0.9 },
  onTime: { shipped: 14, late: 2, subScore: 0.8 },
  volume: { transactions: 1234, counterparties: 20, subScore: 0.5 },
  tenure: { days: 200, subScore: 0.27 },
};

const rated: AdminSellerTrustView = {
  rating: 3.74,
  level: "fair",
  formulaVersion: 1,
  components,
  computedAt: "2026-10-21T00:30:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root.unmount());
  container.remove();
});

function render(trust: AdminSellerTrustView) {
  act(() => root.render(<SellerTrustSection trust={trust} />));
  return container.textContent ?? "";
}

describe("SellerTrustSection", () => {
  it("shows the rated score with two decimals, the level and the breakdown", () => {
    const text = render(rated);
    expect(text).toContain("3,74 / 5");
    expect(text).toContain("seller.trustScore.levels.fair");
    expect(text).toContain("21.10.2026");
    // weights and sub-scores
    for (const w of ["%40", "%25", "%15", "%5"]) expect(text).toContain(w);
    expect(text).toContain("%88");
    // counts, formatted
    expect(text).toContain("admin.users.detail.trust.counts.raters: 12");
    expect(text).toContain(
      "admin.users.detail.trust.counts.transactions: 1.234",
    );
    expect(text).toContain("admin.users.detail.trust.smoothed: 4,50");
  });

  it("shows a new seller with a computed row as not enough data", () => {
    const text = render({
      ...rated,
      rating: null,
      level: "new",
    });
    expect(text).toContain("admin.users.detail.trust.notEnoughData");
    expect(text).toContain("seller.trustScore.levels.new");
    expect(text).not.toContain("/ 5");
    expect(text).toContain("admin.users.detail.trust.counts.raters");
  });

  it("shows not computed yet and no breakdown without a stored row", () => {
    const text = render({
      rating: null,
      level: "new",
      formulaVersion: 1,
      components: null,
      computedAt: null,
    });
    expect(text).toContain("admin.users.detail.trust.notComputed");
    expect(text).not.toContain("admin.users.detail.trust.unavailable");
    expect(text).not.toContain("admin.users.detail.trust.colWeight");
  });

  it("explains a version mismatch instead of a breakdown", () => {
    const text = render({ ...rated, components: null });
    expect(text).toContain("3,74 / 5");
    expect(text).toContain("admin.users.detail.trust.unavailable");
    expect(text).not.toContain("admin.users.detail.trust.colWeight");
  });
});
