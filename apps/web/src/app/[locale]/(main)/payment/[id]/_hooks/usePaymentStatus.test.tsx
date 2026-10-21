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
  getConfig: vi.fn(),
  getStatusLight: vi.fn(),
  getStatusLightGuest: vi.fn(),
  bypassComplete: vi.fn(),
  cancel: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  auth: { isAuthenticated: true, isLoading: false },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "pay-1" }),
  useSearchParams: () => h.search,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
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
  },
}));

import { usePaymentStatus } from "./usePaymentStatus";

type Result = ReturnType<typeof usePaymentStatus>;

const CONFIG = {
  bypassEnabled: false,
  cardStorageEnabled: false,
  recurringEnabled: false,
  purposes: {
    checkout: { cardStorageEnabled: true, recurringEnabled: false },
    membership: { cardStorageEnabled: false, recurringEnabled: true },
  },
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
let result: Result;

function Probe() {
  result = usePaymentStatus();
  return null;
}

async function mount(query: string, status: Record<string, unknown>) {
  h.search = new URLSearchParams(query);
  window.history.replaceState(null, "", `/payment/pay-1?${query}`);
  h.getStatusLight.mockResolvedValue({ data: { id: "pay-1", ...status } });
  h.getStatusLightGuest.mockResolvedValue({
    data: { id: "pay-1", ...status },
  });
  act(() => root.render(<Probe />));
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  h.getConfig.mockResolvedValue({ data: CONFIG });
  h.bypassComplete.mockResolvedValue({ data: { success: true } });
  h.cancel.mockResolvedValue({ data: { success: true } });
  h.auth = { isAuthenticated: true, isLoading: false };
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

describe("usePaymentStatus routing", () => {
  it("checkout: shows the card form while pending (no regression)", async () => {
    await mount("", { status: "pending", orderId: "o1" });

    expect(result.phase).toBe("ready");
    expect(result.kind).toBe("checkout");
    expect(result.purpose).toBe("checkout");
    expect(result.cardStorageEnabled).toBe(true);
    expect(h.push).not.toHaveBeenCalled();
  });

  it.each([
    ["completed", "/payment/success?paymentId=pay-1"],
    ["failed", "/payment/fail?paymentId=pay-1"],
  ])("checkout %s goes to %s (no regression)", async (status, href) => {
    await mount("", { status, orderId: "o1" });
    expect(h.push).toHaveBeenCalledWith(href);
  });

  it.each([
    ["completed", "/payment/success?paymentId=pay-1&type=boost"],
    ["failed", "/payment/fail?paymentId=pay-1&type=boost"],
  ])("boost %s goes to %s", async (status, href) => {
    await mount("type=boost", { status, orderId: "o1", ...BOOST });
    expect(h.push).toHaveBeenCalledWith(href);
    expect(h.push).not.toHaveBeenCalledWith(
      expect.stringContaining("/profile/orders"),
    );
  });

  it("boost without `type` in the URL (after the login redirect) follows the API flag", async () => {
    await mount("", { status: "pending", orderId: "o1", ...BOOST });

    expect(result.kind).toBe("boost");
    // Boost is taken on the marketplace store.
    expect(result.purpose).toBe("checkout");
    expect(result.cardStorageEnabled).toBe(true);
    expect(result.routes.back).toBe("/profile/boosts");
  });

  it("membership completed goes to its success page with the change kind (no regression)", async () => {
    await mount("type=membership&kind=upgrade", {
      status: "completed",
      orderId: "o1",
      isMembershipOrder: true,
    });
    expect(h.replace).toHaveBeenCalledWith("/membership/success?kind=upgrade");
  });

  it("membership reads card storage from its own store", async () => {
    await mount("type=membership", {
      status: "pending",
      orderId: "o1",
      isMembershipOrder: true,
    });
    expect(result.purpose).toBe("membership");
    expect(result.cardStorageEnabled).toBe(false);
  });

  it("the dev bypass completes a boost onto the boost success page", async () => {
    h.getConfig.mockResolvedValue({
      data: { ...CONFIG, bypassEnabled: true },
    });
    await mount("type=boost", { status: "pending", orderId: "o1", ...BOOST });

    expect(h.bypassComplete).toHaveBeenCalledWith("pay-1");
    expect(h.push).toHaveBeenCalledWith(
      "/payment/success?paymentId=pay-1&type=boost",
    );
  });
});

describe("usePaymentStatus guest and membership routing", () => {
  it("guest checkout completed keeps guest=true on the success page", async () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    await mount("guest=true", { status: "completed", orderId: "o1" });

    expect(h.getStatusLightGuest).toHaveBeenCalledWith("pay-1");
    expect(h.getStatusLight).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith(
      "/payment/success?paymentId=pay-1&guest=true",
    );
  });

  it("guest checkout failed keeps guest=true on the fail page", async () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    await mount("guest=true", { status: "failed", orderId: "o1" });
    expect(h.push).toHaveBeenCalledWith(
      "/payment/fail?paymentId=pay-1&guest=true",
    );
  });

  it.each([
    [true, "", "/payment/success?paymentId=pay-1"],
    [false, "guest=true", "/payment/success?paymentId=pay-1&guest=true"],
  ])(
    "the dev bypass sends a checkout (session %s) to %s",
    async (isAuthenticated, query, href) => {
      h.auth = { isAuthenticated, isLoading: false };
      h.getConfig.mockResolvedValue({
        data: { ...CONFIG, bypassEnabled: true },
      });
      await mount(query, { status: "pending", orderId: "o1" });

      expect(h.bypassComplete).toHaveBeenCalledWith("pay-1");
      expect(h.push).toHaveBeenCalledWith(href);
      expect(h.toast.success).toHaveBeenCalledWith(
        "page.payment.usepaymentstatus.odemeBasarili",
      );
    },
  );

  it("the dev bypass sends a membership to its success page with the change kind", async () => {
    h.getConfig.mockResolvedValue({
      data: { ...CONFIG, bypassEnabled: true },
    });
    await mount("type=membership&kind=renew", {
      status: "pending",
      orderId: "o1",
      isMembershipOrder: true,
    });
    expect(h.push).toHaveBeenCalledWith("/membership/success?kind=renew");
  });

  it("membership without `type` in the URL takes card storage from its own store", async () => {
    await mount("", {
      status: "pending",
      orderId: "o1",
      isMembershipOrder: true,
    });

    expect(result.kind).toBe("membership");
    expect(result.purpose).toBe("membership");
    expect(result.cardStorageEnabled).toBe(false);
    expect(result.routes.back).toBe("/membership");
  });

  it("membership without `type` in the URL goes to its success page once completed", async () => {
    await mount("", {
      status: "completed",
      orderId: "o1",
      isMembershipOrder: true,
    });
    expect(h.replace).toHaveBeenCalledWith("/membership/success");
    expect(h.push).not.toHaveBeenCalledWith(
      expect.stringContaining("/payment/success"),
    );
  });

  it("membership failed goes to the fail page that names it", async () => {
    await mount("type=membership", {
      status: "failed",
      orderId: "o1",
      isMembershipOrder: true,
    });
    expect(h.push).toHaveBeenCalledWith(
      "/payment/fail?paymentId=pay-1&type=membership",
    );
  });

  it("a guest never gets card storage, whatever the store allows", async () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    await mount("guest=true", { status: "pending", orderId: "o1" });
    expect(result.purpose).toBe("checkout");
    expect(result.cardStorageEnabled).toBe(false);
  });
});

describe("usePaymentStatus cancel", () => {
  it("checkout: cancels, says the goods are back on sale and returns to the cart (no regression)", async () => {
    await mount("", { status: "pending", orderId: "o1" });
    await act(() => result.handleCancel());

    expect(h.cancel).toHaveBeenCalledWith("pay-1");
    expect(h.toast.success).toHaveBeenCalledWith(
      "page.payment.usepaymentstatus.odemeIptalEdildiUrunTekrarSatisa",
    );
    expect(h.push).toHaveBeenCalledWith("/cart");
  });

  it("checkout guest returns home", async () => {
    h.auth = { isAuthenticated: false, isLoading: false };
    await mount("guest=true", { status: "pending", orderId: "o1" });
    await act(() => result.handleCancel());

    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith("/");
  });

  it("boost: cancels onto the boost cancelled view, with no goods toast", async () => {
    await mount("type=boost", { status: "pending", orderId: "o1", ...BOOST });
    await act(() => result.handleCancel());

    expect(h.cancel).toHaveBeenCalledWith("pay-1");
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith(
      "/payment/fail?paymentId=pay-1&type=boost&cancelled=true",
    );
  });

  it("membership: cancels back to the membership page, not the cart", async () => {
    await mount("type=membership", {
      status: "pending",
      orderId: "o1",
      isMembershipOrder: true,
    });
    await act(() => result.handleCancel());

    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith("/membership");
  });
});

describe("usePaymentStatus load error", () => {
  it.each([
    ["", "/profile/orders"],
    ["guest=true", "/"],
    ["type=membership", "/membership"],
    ["type=boost", "/profile/boosts"],
  ])("with ?%s it leaves for %s", async (query, href) => {
    h.search = new URLSearchParams(query);
    window.history.replaceState(null, "", `/payment/pay-1?${query}`);
    h.getStatusLight.mockRejectedValue(new Error("down"));
    h.getStatusLightGuest.mockRejectedValue(new Error("down"));
    act(() => root.render(<Probe />));
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
    });

    expect(h.toast.error).toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith(href);
  });
});
