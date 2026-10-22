// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});

import { bodyText, mount, type Mounted } from "@/test-utils/dom";
import type { AdPackage, AdPackageTier } from "../_lib/types";
import { PackageCard } from "./PackageCard";

const tier = (over: Partial<AdPackageTier>): AdPackageTier => ({
  id: "tier",
  durationDays: 7,
  minAmount: 0,
  maxAmount: null,
  price: 150,
  campaignPrice: null,
  campaignStartsAt: null,
  campaignEndsAt: null,
  isActive: true,
  ...over,
});

const pkg = (tiers: AdPackageTier[]): AdPackage => ({
  id: "pkg-1",
  name: "Vitrin",
  slug: "vitrin",
  showcaseOnHome: false,
  isActive: true,
  sortOrder: 0,
  audienceMode: "everyone",
  targetTierTypes: [],
  targetUsers: [],
  createdAt: "2026-07-26T00:00:00.000Z",
  tiers,
});

// jsdom has neither; the table cells use them to decide on a tooltip.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterAll(() => vi.unstubAllGlobals());

let view: Mounted | undefined;
afterEach(() => view?.unmount());

const render = (tiers: AdPackageTier[]) => {
  view = mount(
    <PackageCard pkg={pkg(tiers)} onEdit={vi.fn()} onDelete={vi.fn()} />,
  );
};

describe("PackageCard price bands", () => {
  it("labels each band with the last cent inside it, open-ended last", () => {
    render([
      tier({ id: "a", minAmount: 0, maxAmount: 1000 }),
      tier({ id: "b", minAmount: 1000, maxAmount: 5000 }),
      tier({ id: "c", minAmount: 5000, maxAmount: null }),
    ]);

    const text = bodyText();
    expect(text).toContain("₺0,00 – ₺999,99");
    expect(text).toContain("₺1.000,00 – ₺4.999,99");
    expect(text).toContain("₺5.000,00 – ∞");
  });

  it("shows the gap a 999 upper bound leaves before the next band", () => {
    render([
      tier({ id: "a", minAmount: 200, maxAmount: 999 }),
      tier({ id: "b", minAmount: 1000, maxAmount: null }),
    ]);

    expect(bodyText()).toContain("₺200,00 – ₺998,99");
    expect(bodyText()).toContain("₺1.000,00 – ∞");
  });
});
