// @vitest-environment jsdom
/** @format */

import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({ api: { post: h.post, get: vi.fn() } }));

import { paymentsApi, reinitiatePayment } from "./payments";

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("paymentsApi.installmentOptions", () => {
  it("posts the BIN body with the abort signal; a guest's payment carries its capability", async () => {
    sessionStorage.setItem("payment-capability.pay-1", "cap-token");
    h.post.mockResolvedValue({ data: {} });
    const controller = new AbortController();

    await paymentsApi.installmentOptions(
      { bin: "45467112", paymentId: "pay-1" },
      { signal: controller.signal },
    );

    expect(h.post).toHaveBeenCalledWith(
      "/payments/installment-options",
      { bin: "45467112", paymentId: "pay-1" },
      {
        signal: controller.signal,
        headers: { "X-Payment-Capability": "cap-token" },
      },
    );
  });

  it("the checkout amount mode sends no capability header", async () => {
    h.post.mockResolvedValue({ data: {} });
    await paymentsApi.installmentOptions({ bin: "45467112", amount: 1000 });
    expect(h.post.mock.calls[0][2]).toEqual({
      signal: undefined,
      headers: undefined,
    });
  });
});

describe("reinitiatePayment (409 paymentAmountOutOfDate)", () => {
  it.each([
    [
      { checkoutGroupId: "g1" },
      false,
      "/payments/initiate",
      { checkoutGroupId: "g1" },
    ],
    [
      { checkoutGroupId: "g1" },
      true,
      "/payments/initiate-guest",
      { checkoutGroupId: "g1" },
    ],
    [{ orderId: "o1" }, false, "/payments/initiate", { orderId: "o1" }],
    [{ orderId: "o1" }, true, "/payments/initiate-guest", { orderId: "o1" }],
  ])("%j guest=%s uses %s", async (target, guest, path, body) => {
    h.post.mockResolvedValue({ data: { paymentId: "pay-2" } });
    await expect(reinitiatePayment(target, guest)).resolves.toBe("pay-2");
    expect(h.post).toHaveBeenCalledWith(path, { ...body, provider: "paytr" });
  });

  it("trade cash initiates its own payment", async () => {
    h.post.mockResolvedValue({ data: { data: { paymentId: "pay-3" } } });
    await expect(reinitiatePayment({ tradeId: "t1" }, false)).resolves.toBe(
      "pay-3",
    );
    expect(h.post).toHaveBeenCalledWith("/payments/initiate-trade-cash", {
      tradeId: "t1",
    });
  });

  it("nothing to initiate or no id answered: null", async () => {
    await expect(reinitiatePayment({}, false)).resolves.toBeNull();
    h.post.mockResolvedValue({ data: {} });
    await expect(
      reinitiatePayment({ orderId: "o1" }, false),
    ).resolves.toBeNull();
  });
});
