// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  search: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
  getStatusLight: vi.fn(),
  getStatusLightGuest: vi.fn(),
  confirmFailed: vi.fn(),
  auth: { isAuthenticated: true, isLoading: false },
}));

vi.mock("next-intl", () => ({ useLocale: () => "tr" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => h.search }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
}));
vi.mock("@/stores/authStore", () => ({ useAuthStore: () => h.auth }));
vi.mock("@/lib/api", () => ({
  paymentsApi: {
    getStatusLight: h.getStatusLight,
    getStatusLightGuest: h.getStatusLightGuest,
    confirmFailed: h.confirmFailed,
  },
}));

import { usePaymentFail } from "./usePaymentFail";

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
let result: ReturnType<typeof usePaymentFail>;

function Probe() {
  result = usePaymentFail();
  return null;
}

async function mount(query: string, status: Record<string, unknown>) {
  h.search = new URLSearchParams(query);
  window.history.replaceState(null, "", `/payment/fail?${query}`);
  h.getStatusLight.mockResolvedValue({ data: { id: "p1", ...status } });
  h.getStatusLightGuest.mockResolvedValue({ data: { id: "p1", ...status } });
  act(() => root.render(<Probe />));
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  h.confirmFailed.mockResolvedValue({ data: { released: true } });
  h.auth = { isAuthenticated: true, isLoading: false };
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

describe("usePaymentFail", () => {
  it("boost: releases a still-pending payment and retries from the listing's dialog", async () => {
    await mount("paymentId=p1&type=boost", { status: "pending", ...BOOST });

    expect(h.confirmFailed).toHaveBeenCalledWith("p1");
    expect(result.phase).toBe("ready");
    expect(result.kind).toBe("boost");
    expect(result.cancelled).toBe(false);
    expect(result.routes.retry).toBe("/profile/listings?boost=listing-1");
    expect(result.routes.back).toBe("/profile/boosts");
  });

  it("boost: the buyer's own cancel shows the cancelled view and calls nothing", async () => {
    await mount("paymentId=p1&type=boost&cancelled=true", {
      status: "failed",
      ...BOOST,
    });

    expect(result.cancelled).toBe(true);
    expect(h.confirmFailed).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("a payment that completed after all goes to its success page", async () => {
    await mount("paymentId=p1&type=boost&cancelled=true", {
      status: "completed",
      ...BOOST,
    });

    expect(h.replace).toHaveBeenCalledWith(
      "/payment/success?paymentId=p1&type=boost",
    );
    expect(h.confirmFailed).not.toHaveBeenCalled();
    expect(result.phase).toBe("loading");
  });

  it("checkout: releases a pending payment and keeps the orders routes (no regression)", async () => {
    await mount("paymentId=p1", { status: "pending", orderId: "o1" });

    expect(h.confirmFailed).toHaveBeenCalledWith("p1");
    expect(result.kind).toBe("checkout");
    expect(result.routes.back).toBe("/profile/orders");
    expect(result.routes.retry).toBe("/profile/orders");
  });

  it("checkout ignores the cancelled flag (boost has the only cancelled view)", async () => {
    await mount("paymentId=p1&cancelled=true", { status: "failed" });
    expect(result.cancelled).toBe(false);
  });

  it("checkout guest retries from the listings (no regression)", async () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    await mount("paymentId=p1&guest=true", { status: "failed" });

    expect(h.getStatusLightGuest).toHaveBeenCalledWith("p1");
    expect(result.isGuestCheckout).toBe(true);
    expect(result.routes.retry).toBe("/listings");
  });

  it("membership goes back to the membership page, never to orders", async () => {
    await mount("paymentId=p1&type=membership", {
      status: "failed",
      isMembershipOrder: true,
    });
    expect(result.kind).toBe("membership");
    expect(result.routes.back).toBe("/membership");
    expect(result.routes.retry).toBe("/membership");
  });
});
