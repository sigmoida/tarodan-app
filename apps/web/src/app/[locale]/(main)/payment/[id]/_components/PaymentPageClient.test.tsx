// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The pay page end to end on the client: the real lifecycle hook decides the
 * kind from the LOADED payment and the real ready view asks (or does not ask)
 * for the distance sales contract on that kind. Only the network, the router
 * and the card fields are doubles.
 */
const h = vi.hoisted(() => ({
  search: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
  getConfig: vi.fn(),
  getStatusLight: vi.fn(),
  getStatusLightGuest: vi.fn(),
  bypassComplete: vi.fn(),
  cancel: vi.fn(),
  prepareDirectForm: vi.fn(),
  listCards: vi.fn(),
  formSubmit: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  auth: { isAuthenticated: true, isLoading: false },
}));

// The key comes back instead of the text; rich tags render around their name.
vi.mock("next-intl", () => {
  const t = (key: string) => key;
  t.rich = (key: string, values: Record<string, unknown> = {}) =>
    createElement(
      Fragment,
      null,
      key,
      ...Object.values(values)
        .filter((v) => typeof v === "function")
        .map((render) => (render as (c: ReactNode) => ReactNode)("link")),
    );
  return { useTranslations: () => t };
});
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "pay-1" }),
  useSearchParams: () => h.search,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/stores/authStore", () => ({ useAuthStore: () => h.auth }));
vi.mock("@/lib/authMarker", () => ({ hasAuthMarker: () => false }));
vi.mock("@/lib/api", async () => ({
  paymentCapabilities: (await import("@/lib/api/payments")).paymentCapabilities,
  paymentsApi: {
    getConfig: h.getConfig,
    getStatusLight: h.getStatusLight,
    getStatusLightGuest: h.getStatusLightGuest,
    bypassComplete: h.bypassComplete,
    cancel: h.cancel,
    prepareDirectForm: h.prepareDirectForm,
  },
  membershipApi: { listCards: h.listCards },
}));
// The card fields are not under test: a saved card is pre-selected, so the
// submit needs no card input.
vi.mock("@/components/payment/CardPaymentSection", () => ({
  default: () => null,
}));
// The barrel also exports server-only composites.
vi.mock("@/components/ui", () => ({
  SectionCard: ({ children }: { children: ReactNode }) =>
    createElement("section", null, children),
}));
vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
}));

import PaymentPageClient from "./PaymentPageClient";

/** Both stores keep cards, so every kind pays with a pre-selected saved card. */
const CONFIG = {
  bypassEnabled: false,
  cardStorageEnabled: false,
  recurringEnabled: false,
  purposes: {
    checkout: { cardStorageEnabled: true, recurringEnabled: false },
    membership: { cardStorageEnabled: true, recurringEnabled: true },
  },
};
const SAVED_CARD = {
  id: "card-1",
  last4: "4242",
  brand: null,
  bank: null,
  cardType: null,
  cardScheme: null,
  businessCard: null,
  expMonth: null,
  expYear: null,
  requireCvv: false,
};
const BOOST = {
  isBoostOrder: true,
  boost: {
    id: "boost-1",
    productId: "listing-1",
    productTitle: "Ferrari",
    endsAt: null,
  },
};

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

async function open(query: string, status: Record<string, unknown>) {
  h.search = new URLSearchParams(query);
  window.history.replaceState(null, "", `/payment/pay-1?${query}`);
  h.getStatusLight.mockResolvedValue({
    data: { id: "pay-1", status: "pending", amount: 100, ...status },
  });
  act(() => root.render(<PaymentPageClient />));
  await flush();
}

const checkboxes = () =>
  Array.from(
    container.querySelectorAll('input[type="checkbox"]'),
  ) as HTMLInputElement[];
function payButton(): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("checkout.payNow"),
  );
  if (!found) throw new Error("no pay button");
  return found as HTMLButtonElement;
}
const click = (el: HTMLElement) => act(() => el.click());
const sentBody = () => h.prepareDirectForm.mock.calls[0][0];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.auth = { isAuthenticated: true, isLoading: false };
  h.getConfig.mockResolvedValue({ data: CONFIG });
  h.listCards.mockResolvedValue({ data: [SAVED_CARD] });
  h.prepareDirectForm.mockResolvedValue({
    data: {
      paymentId: "pay-1",
      action: "https://www.paytr.com/odeme",
      method: "POST",
      fields: [{ name: "merchant_oid", value: "OID1" }],
      requireCvv: false,
      savedCard: true,
      status: "pending",
    },
  });
  // jsdom does not navigate: the PayTR post is only recorded.
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(
    h.formSubmit,
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("PaymentPageClient distance sales consent by the loaded payment", () => {
  it("membership paid by a URL without `type` (login redirect): no contract checkbox, nothing sent", async () => {
    await open("", { orderId: "order-m", isMembershipOrder: true });

    expect(h.listCards).toHaveBeenCalledWith("membership");
    expect(checkboxes()).toHaveLength(0);
    expect(container.textContent).not.toContain(
      "checkout.distanceSalesConsent",
    );
    expect(payButton().disabled).toBe(false);

    click(payButton());
    await flush();

    expect(h.prepareDirectForm).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({
      orderId: "order-m",
      paymentId: "pay-1",
      savedCardId: "card-1",
    });
    expect(sentBody()).not.toHaveProperty("distanceSalesAccepted");
  });

  it("boost paid by a URL without `type`: no contract checkbox, marketplace store, nothing sent", async () => {
    await open("", { orderId: "order-b", ...BOOST });

    expect(h.listCards).toHaveBeenCalledWith("checkout");
    expect(checkboxes()).toHaveLength(0);
    expect(payButton().disabled).toBe(false);

    click(payButton());
    await flush();

    expect(sentBody()).not.toHaveProperty("distanceSalesAccepted");
    expect(sentBody()).toMatchObject({ orderId: "order-b" });
  });

  it.each(["boost", "membership"])(
    "an order of goods opened with `type=%s` still requires and sends the contract",
    async (type) => {
      // The URL is only a hint: the loaded payment has no virtual order flag,
      // so it is a sale of goods (an offer order) and the gate stays.
      await open(`type=${type}`, { orderId: "order-offer" });

      expect(h.listCards).toHaveBeenCalledWith("checkout");
      expect(checkboxes()).toHaveLength(1);
      expect(payButton().disabled).toBe(true);
      click(payButton());
      await flush();
      expect(h.prepareDirectForm).not.toHaveBeenCalled();

      click(checkboxes()[0]);
      click(payButton());
      await flush();

      expect(sentBody()).toEqual({
        orderId: "order-offer",
        paymentId: "pay-1",
        savedCardId: "card-1",
        distanceSalesAccepted: true,
      });
    },
  );

  it("a cart payment requires the contract and sends it with the group", async () => {
    await open("", { checkoutGroupId: "group-1" });

    expect(checkboxes()).toHaveLength(1);
    expect(payButton().disabled).toBe(true);

    click(checkboxes()[0]);
    click(payButton());
    await flush();

    expect(sentBody()).toEqual({
      checkoutGroupId: "group-1",
      paymentId: "pay-1",
      savedCardId: "card-1",
      distanceSalesAccepted: true,
    });
  });
});
