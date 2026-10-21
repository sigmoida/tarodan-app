// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoostOffer } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  signedIn: true,
  seller: true,
  path: "/",
  offers: vi.fn(),
  dismissOffers: vi.fn(),
  boostDialog: null as null | { listing: { id: string; title: string } },
}));

vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${JSON.stringify(values)}` : key;
  return { useTranslations: () => t };
});
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => h.path }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({
      isAuthenticated: h.signedIn,
      user: { membershipTier: "free", isSeller: h.seller },
    }),
}));
vi.mock("@/lib/api", () => ({
  boostApi: { offers: h.offers, dismissOffers: h.dismissOffers },
}));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="img">{alt}</span>,
}));
// The boost dialog becomes a probe; `dynamic` loads whatever it is given.
vi.mock("./BoostModal", () => ({
  default: (props: { listing: { id: string; title: string } }) => {
    h.boostDialog = props;
    return <div data-testid="boost-dialog">{props.listing.id}</div>;
  },
}));
vi.mock("next/dynamic", async () => {
  const { lazy, Suspense } = await import("react");
  return {
    default: (loader: () => Promise<{ default: React.ComponentType }>) => {
      const Lazy = lazy(loader);
      return function Dynamic(props: object) {
        return (
          <Suspense fallback={null}>
            <Lazy {...props} />
          </Suspense>
        );
      };
    },
  };
});

import BoostOfferHost, { isOfferSuppressedPath } from "./BoostOfferHost";
import BoostOfferMount from "./BoostOfferMount";
import { useBoostDialogStore } from "@/stores/boostDialogStore";
import { useOnboardingTourStore } from "@/stores/onboardingTourStore";
import { useRequiredStepsStore } from "@/stores/requiredStepsStore";

const offer = (id: string, title: string): BoostOffer => ({
  productId: id,
  title,
  image: null,
  price: 1500,
  createdAt: "2026-10-20T10:00:00.000Z",
});
const TWO = [offer("p1", "Ferrari F40"), offer("p2", "Porsche 911")];

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function render(ui: ReactNode = <BoostOfferHost />) {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    ),
  );
  await flush();
}
const rerender = async (ui: ReactNode = <BoostOfferHost />) => render(ui);

const body = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
const click = async (label: string) => {
  const el = button(label);
  if (!el) throw new Error(`no button ${label}`);
  act(() => el.click());
  await flush();
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.signedIn = true;
  h.seller = true;
  h.path = "/";
  h.boostDialog = null;
  useBoostDialogStore.setState({ openDialogs: 0, offerOpen: false });
  useRequiredStepsStore.setState({ outstanding: false });
  useOnboardingTourStore.setState({ running: false });
  h.offers.mockReset();
  h.dismissOffers.mockReset();
  h.dismissOffers.mockResolvedValue({ data: undefined });
  h.offers.mockResolvedValue({ data: { enabled: true, offers: TWO } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

describe("BoostOfferHost", () => {
  it("lists every due listing by name, each with its own action", async () => {
    await render();

    expect(body()).toContain('boost.offer.title|{"count":2}');
    expect(body()).toContain("boost.offer.intro");
    expect(body()).toContain("boost.offer.onceHint");
    expect(body()).toContain("Ferrari F40");
    expect(body()).toContain("Porsche 911");
    const actions = [...document.body.querySelectorAll("button")].filter(
      (b) => b.textContent === "product.boostListing",
    );
    expect(actions).toHaveLength(2);
    expect(h.dismissOffers).not.toHaveBeenCalled();
  });

  it("shows nothing when boost is off, with no offers, or on failure", async () => {
    h.offers.mockResolvedValue({ data: { enabled: false, offers: TWO } });
    await render();
    expect(body()).not.toContain("boost.offer.title");

    client.clear();
    h.offers.mockResolvedValue({ data: { enabled: true, offers: [] } });
    await rerender(<BoostOfferHost key="a" />);
    expect(body()).not.toContain("boost.offer.title");

    client.clear();
    h.offers.mockRejectedValue(new Error("down"));
    await rerender(<BoostOfferHost key="b" />);
    expect(body()).not.toContain("boost.offer.title");
  });

  it.each([
    "/payment/success",
    "/payment/abc",
    "/cart/payment",
    "/checkout",
    "/membership/checkout",
  ])(
    "waits on %s without dismissing, then opens on the next page",
    async (path) => {
      h.path = path;
      await render();
      expect(body()).not.toContain("boost.offer.title");
      expect(h.dismissOffers).not.toHaveBeenCalled();

      h.path = "/search";
      await rerender();
      expect(body()).toContain("Ferrari F40");
    },
  );

  it("knows the suppressed paths", () => {
    expect(isOfferSuppressedPath("/payment")).toBe(true);
    expect(isOfferSuppressedPath("/payment/fail")).toBe(true);
    expect(isOfferSuppressedPath("/cart/payment")).toBe(true);
    expect(isOfferSuppressedPath("/checkout/address")).toBe(true);
    expect(isOfferSuppressedPath("/membership/checkout")).toBe(true);
    expect(isOfferSuppressedPath("/profile/listings")).toBe(false);
    expect(isOfferSuppressedPath("/cart")).toBe(false);
    expect(isOfferSuppressedPath("/payment-options")).toBe(false);
    expect(isOfferSuppressedPath("/checkouts-guide")).toBe(false);
    expect(isOfferSuppressedPath("/membership")).toBe(false);
  });

  it.each([
    [
      "a required step is pending",
      () => useRequiredStepsStore.setState({ outstanding: true }),
    ],
    [
      "the onboarding tour runs",
      () => useOnboardingTourStore.setState({ running: true }),
    ],
    [
      "another page's boost dialog is open",
      () => useBoostDialogStore.setState({ openDialogs: 1 }),
    ],
  ] as const)("waits while %s, then opens", async (_, block) => {
    act(() => {
      block();
    });
    await render();
    expect(body()).not.toContain("boost.offer.title");
    expect(useBoostDialogStore.getState().offerOpen).toBe(false);

    act(() => {
      useRequiredStepsStore.setState({ outstanding: false });
      useOnboardingTourStore.setState({ running: false });
      useBoostDialogStore.setState({ openDialogs: 0 });
    });
    await flush();
    expect(body()).toContain("Ferrari F40");
    expect(useBoostDialogStore.getState().offerOpen).toBe(true);
  });

  it("publishes its open state for the other layers", async () => {
    await render();
    expect(useBoostDialogStore.getState().offerOpen).toBe(true);

    await click("boost.offer.notNow");
    expect(useBoostDialogStore.getState().offerOpen).toBe(false);
  });

  it("dismisses an offer that arrived while the dialog was open", async () => {
    h.offers.mockResolvedValueOnce({
      data: { enabled: true, offers: [TWO[0]] },
    });
    await render();
    expect(body()).not.toContain("Porsche 911");

    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(body()).toContain("Porsche 911");

    await click("boost.offer.notNow");
    expect(h.dismissOffers).toHaveBeenCalledTimes(1);
    expect(h.dismissOffers).toHaveBeenCalledWith({ productIds: ["p1", "p2"] });
  });

  it("choosing one dismisses all and opens the boost dialog, never nested", async () => {
    await render();
    await click(
      "product.cardAction.boostAria|" +
        JSON.stringify({ title: "Porsche 911" }),
    );

    expect(h.dismissOffers).toHaveBeenCalledTimes(1);
    expect(h.dismissOffers).toHaveBeenCalledWith({ productIds: ["p1", "p2"] });
    expect(body()).not.toContain("boost.offer.title");
    expect(h.boostDialog?.listing).toEqual({
      id: "p2",
      title: "Porsche 911",
    });
    expect(
      document.querySelector('[data-testid="boost-dialog"]'),
    ).not.toBeNull();
    expect(useBoostDialogStore.getState()).toMatchObject({
      openDialogs: 1,
      offerOpen: false,
    });
  });

  it('"not now" dismisses all listed offers and closes', async () => {
    await render();
    await click("boost.offer.notNow");

    expect(h.dismissOffers).toHaveBeenCalledWith({ productIds: ["p1", "p2"] });
    expect(body()).not.toContain("boost.offer.title");
    expect(h.boostDialog).toBeNull();
  });

  it("closing (X) dismisses all listed offers", async () => {
    await render();
    await click("common.close");

    expect(h.dismissOffers).toHaveBeenCalledWith({ productIds: ["p1", "p2"] });
    expect(body()).not.toContain("boost.offer.title");
  });

  it("does not reopen in the same session when the dismiss request fails", async () => {
    h.dismissOffers.mockRejectedValue(new Error("down"));
    await render();
    await click("boost.offer.notNow");
    expect(body()).not.toContain("boost.offer.title");

    // The server still lists them: a route change and a focus refetch.
    h.path = "/search";
    await rerender();
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();

    expect(h.offers.mock.calls.length).toBeGreaterThan(1);
    expect(body()).not.toContain("boost.offer.title");
  });

  it("asks again on tab focus and shows a newly approved listing", async () => {
    h.offers.mockResolvedValueOnce({ data: { enabled: true, offers: [] } });
    await render();
    expect(body()).not.toContain("boost.offer.title");
    expect(h.offers).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();

    expect(h.offers).toHaveBeenCalledTimes(2);
    expect(body()).toContain("Ferrari F40");
  });

  it("asks again on a route change", async () => {
    await render();
    h.path = "/search";
    await rerender();
    expect(h.offers).toHaveBeenCalledTimes(2);
  });

  it("does not ask on a route change to a suppressed page", async () => {
    await render();
    h.path = "/cart/payment";
    await rerender();
    expect(h.offers).toHaveBeenCalledTimes(1);
  });
});

describe("BoostOfferMount", () => {
  it("renders nothing and asks for nothing for a guest", async () => {
    h.signedIn = false;
    await render(<BoostOfferMount />);
    expect(h.offers).not.toHaveBeenCalled();
    expect(body()).not.toContain("boost.offer.title");
  });

  it("renders nothing and asks for nothing for a buyer", async () => {
    h.seller = false;
    await render(<BoostOfferMount />);
    expect(h.offers).not.toHaveBeenCalled();
    expect(body()).not.toContain("boost.offer.title");
  });

  it("opens the dialog for a signed-in seller", async () => {
    await render(<BoostOfferMount />);
    // The lazy chunk resolves outside act: keep flushing inside it.
    await vi.waitFor(async () => {
      await flush();
      expect(body()).toContain("Ferrari F40");
    });
  });
});
