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
  verify: vi.fn(),
  getStatusLight: vi.fn(),
  getStatusLightGuest: vi.fn(),
  auth: { isAuthenticated: true, isLoading: false },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "tr",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => h.search }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
}));
vi.mock("@/stores/authStore", () => ({ useAuthStore: () => h.auth }));
vi.mock("@/lib/api", () => ({
  paymentsApi: {
    verify: h.verify,
    getStatusLight: h.getStatusLight,
    getStatusLightGuest: h.getStatusLightGuest,
  },
}));

import { usePaymentSuccess } from "./usePaymentSuccess";

const BOOST = {
  id: "boost-1",
  productId: "listing-1",
  productTitle: "Ferrari",
  endsAt: "2026-10-28T12:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof usePaymentSuccess>;

function Probe() {
  result = usePaymentSuccess();
  return null;
}

async function mount(query: string, status?: Record<string, unknown>) {
  h.search = new URLSearchParams(query);
  window.history.replaceState(null, "", `/payment/success?${query}`);
  if (status) {
    h.getStatusLight.mockResolvedValue({ data: { id: "p1", ...status } });
    h.getStatusLightGuest.mockResolvedValue({ data: { id: "p1", ...status } });
  }
  act(() => root.render(<Probe />));
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  // `completed: true` ends the verify loop at once (no 1.2 s waits).
  h.verify.mockResolvedValue({ data: { completed: true } });
  h.auth = { isAuthenticated: true, isLoading: false };
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

describe("usePaymentSuccess", () => {
  it("boost completed: stays to show the boost, with My boosts as the way on", async () => {
    await mount("paymentId=p1&type=boost", {
      status: "completed",
      isBoostOrder: true,
      boost: BOOST,
    });

    expect(h.replace).not.toHaveBeenCalled();
    expect(result.phase).toBe("ready");
    expect(result.kind).toBe("boost");
    expect(result.isCompleted).toBe(true);
    expect(result.boost).toEqual(BOOST);
    expect(result.routes.back).toBe("/profile/boosts");
  });

  it("boost still pending: stays on the pending view (no orders fallback)", async () => {
    await mount("paymentId=p1&type=boost", {
      status: "pending",
      isBoostOrder: true,
      boost: { ...BOOST, endsAt: null },
    });

    expect(h.replace).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
    expect(result.isCompleted).toBe(false);
    expect(result.boost?.endsAt).toBeNull();
  });

  it("boost failed goes to the boost fail page", async () => {
    await mount("paymentId=p1&type=boost", {
      status: "failed",
      isBoostOrder: true,
      boost: BOOST,
    });
    expect(h.replace).toHaveBeenCalledWith(
      "/payment/fail?paymentId=p1&type=boost",
    );
  });

  it("checkout failed goes to the fail page, keeping guest (no regression)", async () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    await mount("paymentId=p1&guest=true", { status: "failed" });
    expect(h.getStatusLightGuest).toHaveBeenCalledWith("p1");
    expect(h.replace).toHaveBeenCalledWith(
      "/payment/fail?paymentId=p1&guest=true",
    );
  });

  it("checkout completed stays on the order success view (no regression)", async () => {
    await mount("paymentId=p1", { status: "completed", orderId: "o1" });
    expect(h.replace).not.toHaveBeenCalled();
    expect(result.kind).toBe("checkout");
    expect(result.routes.back).toBe("/profile/orders");
  });

  it("type=membership goes to the membership success page before any fetch (no regression)", async () => {
    await mount("paymentId=p1&type=membership");
    expect(h.replace).toHaveBeenCalledWith("/membership/success");
    expect(h.verify).not.toHaveBeenCalled();
  });

  it("a membership payment without `type` goes there once loaded (no regression)", async () => {
    await mount("paymentId=p1", {
      status: "completed",
      isMembershipOrder: true,
    });
    expect(h.replace).toHaveBeenCalledWith("/membership/success");
  });

  it("a trade cash payment goes back to its trade (no regression)", async () => {
    await mount("paymentId=p1", { status: "completed", tradeId: "t1" });
    expect(h.replace).toHaveBeenCalledWith("/profile/trades/t1?paid=1");
  });

  it("sends a signed-out visitor without guest to login (no regression)", async () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    await mount("paymentId=p1&type=boost");
    expect(h.push).toHaveBeenCalledWith("/login");
    expect(h.verify).not.toHaveBeenCalled();
  });
});
